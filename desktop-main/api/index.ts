import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { signRequestHeaders } from "../server/iris-signer";

/**
 * `/api/*` reverse proxy for the browser build.
 *
 * The desktop app signs its requests in the Electron main process and is not
 * subject to CORS. A browser (Vercel PWA) can do neither, so this function
 * forwards the call to the Iris API with the same HMAC headers and answers with
 * an open CORS policy.
 *
 * Everything it needs lives inside the deployed project (`server/`), so there is
 * no import that could resolve outside the Vercel build.
 *
 * Routing: a plain Vercel function has no `[...path]` catch-all (that syntax is
 * Next.js only), so every `/api/*` request is rewritten to this single entry
 * point by vercel.json, and the original path is restored below.
 */

const DEFAULT_UPSTREAM = "https://api.tryliner.fun";
const PROXY_PREFIX = "/api";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; IrisPWA/1.0; +https://vercel.app)";

function upstreamBase(): string {
  return (process.env.IRIS_API_UPSTREAM ?? DEFAULT_UPSTREAM).replace(/\/+$/, "");
}

type NodeRequest = IncomingMessage & { body?: unknown };
type NodeResponse = ServerResponse;

const FORWARDED_REQUEST_HEADERS = new Set([
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "if-modified-since",
  "if-none-match",
  "range",
  "x-client-version",
  "x-platform",
  "x-request-id",
  "x-session-id",
]);

const DROPPED_RESPONSE_HEADERS = new Set([
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-credentials",
  "access-control-expose-headers",
  "access-control-max-age",
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
]);

const FORWARDED_RESPONSE_HEADERS = new Set([
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-range",
  "content-type",
  "date",
  "etag",
  "expires",
  "last-modified",
  "location",
  "retry-after",
  "vary",
  "x-request-id",
]);

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "*, content-range, content-length, etag",
    "access-control-max-age": "86400",
  };
}

function sendJson(res: NodeResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": String(Buffer.byteLength(body)),
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readBody(req: NodeRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return Buffer.alloc(0);
  }
  if (chunks.length > 0) return Buffer.concat(chunks);

  // Some runtimes parse the body before the handler and leave the stream empty.
  // Re-serialize it so the signature still covers a body (non-JSON payloads are
  // forwarded byte for byte).
  const parsed = req.body;
  if (Buffer.isBuffer(parsed)) return parsed;
  if (typeof parsed === "string") return Buffer.from(parsed);
  if (parsed && typeof parsed === "object") {
    return Buffer.from(JSON.stringify(parsed));
  }
  return Buffer.alloc(0);
}

/**
 * Rebuilds the upstream path/query for a request rewritten to `/api/index`.
 *
 * Two shapes are supported so the proxy works whether the platform keeps the
 * original URL (`/api/v1/tracks?limit=2`) or replaces it with the rewrite
 * destination (`/api/index?__iris_path=v1/tracks&limit=2`).
 */
export function resolveUpstreamPath(requestUrl: string): string {
  const queryIndex = requestUrl.indexOf("?");
  const rawPath =
    queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex);
  const params = new URLSearchParams(
    queryIndex === -1 ? "" : requestUrl.slice(queryIndex + 1),
  );

  const injected = params.get("__iris_path");
  params.delete("__iris_path");

  let path: string;
  if (rawPath === PROXY_PREFIX || rawPath === `${PROXY_PREFIX}/index`) {
    // rewritten to the entry point: the original path arrives as a parameter
    path =
      injected && injected !== "$1" && injected !== ":path*"
        ? `/${injected.replace(/^\/+/, "")}`
        : "/";
  } else if (rawPath.startsWith(`${PROXY_PREFIX}/`)) {
    path = rawPath.slice(PROXY_PREFIX.length);
  } else {
    path = rawPath || "/";
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export default async function handler(
  req: NodeRequest,
  res: NodeResponse,
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  const method = (req.method ?? "GET").toUpperCase();
  const pathWithQuery = resolveUpstreamPath(req.url ?? "/");
  const pathOnly = pathWithQuery.split("?")[0];
  if (!pathOnly.startsWith("/")) {
    sendJson(res, 400, { message: "Invalid API path." });
    return;
  }

  const body =
    method === "GET" || method === "HEAD"
      ? Buffer.alloc(0)
      : await readBody(req);

  const headers: Record<string, string> = {
    // upstream compression is disabled so the body can be streamed untouched
    "accept-encoding": "identity",
    "user-agent":
      typeof req.headers["user-agent"] === "string" &&
      req.headers["user-agent"].length > 0
        ? req.headers["user-agent"]
        : DEFAULT_USER_AGENT,
  };

  for (const [name, value] of Object.entries(req.headers)) {
    if (!FORWARDED_REQUEST_HEADERS.has(name)) continue;
    if (typeof value === "string") {
      headers[name] = value;
    } else if (Array.isArray(value)) {
      headers[name] = value.join(", ");
    }
  }

  try {
    Object.assign(headers, signRequestHeaders(method, pathOnly, body));
  } catch (error) {
    sendJson(res, 500, {
      message:
        error instanceof Error
          ? `Request signing failed: ${error.message}`
          : "Request signing failed.",
    });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${upstreamBase()}${pathWithQuery}`, {
      method,
      headers,
      ...(body.length > 0 ? { body: new Uint8Array(body) } : {}),
      redirect: "manual",
    });
  } catch (error) {
    sendJson(res, 502, {
      message:
        error instanceof Error
          ? `Upstream request failed: ${error.message}`
          : "Upstream request failed.",
    });
    return;
  }

  // A Cloudflare challenge served to a datacenter IP is not a real API answer:
  // report it clearly instead of forwarding the HTML page as a network error.
  const contentType = upstream.headers.get("content-type") ?? "";
  const challenged =
    upstream.headers.get("cf-mitigated") === "challenge" ||
    (upstream.status === 403 && contentType.includes("text/html"));
  if (challenged) {
    await upstream.body?.cancel().catch(() => {});
    sendJson(res, 502, {
      message:
        "The Iris API is challenging this deployment (Cloudflare edge). Allow the deployment origin on the API, then retry.",
      code: "EDGE_CHALLENGE",
    });
    return;
  }

  const responseHeaders: Record<string, string> = { ...corsHeaders() };
  for (const [name, value] of upstream.headers.entries()) {
    const lower = name.toLowerCase();
    if (DROPPED_RESPONSE_HEADERS.has(lower)) continue;
    if (!FORWARDED_RESPONSE_HEADERS.has(lower)) continue;
    responseHeaders[lower] = value;
  }
  // content-length is only trustworthy for an untouched, unencoded body
  const length = upstream.headers.get("content-length");
  if (length && !upstream.headers.get("content-encoding")) {
    responseHeaders["content-length"] = length;
  }

  res.writeHead(upstream.status, responseHeaders);

  if (!upstream.body || method === "HEAD" || upstream.status === 204) {
    res.end();
    return;
  }

  const stream = Readable.fromWeb(
    upstream.body as Parameters<typeof Readable.fromWeb>[0],
  );
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}
