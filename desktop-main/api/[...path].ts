import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { SIGNER_WASM_BASE64 } from "../electron/signer";

/**
 * `/api/*` reverse proxy for the browser build.
 *
 * The desktop app signs its requests in the Electron main process and is not
 * subject to CORS. A browser (Vercel PWA) can do neither, so this function
 * forwards the call to the Iris API with the same HMAC headers and answers with
 * an open CORS policy.
 *
 * Signature scheme (see electron/crypto.ts):
 *   canonical = METHOD \n path-without-query \n timestamp \n nonce \n sha256hex(body)
 *   signature = base64url(HMAC-SHA256(secret, canonical))
 *
 * The secret is either `IRIS_SIGNING_SECRET` (or `LINER_SIGNING_SECRET`) when
 * the deployment has it, or the obfuscated production key inside the signer
 * WASM that already ships with the app, so the proxy works without copying any
 * secret into Vercel.
 */

const DEFAULT_UPSTREAM = "https://api.tryliner.fun";
const PROXY_PREFIX = "/api";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; IrisPWA/1.0; +https://vercel.app)";

const UPSTREAM = (process.env.IRIS_API_UPSTREAM ?? DEFAULT_UPSTREAM).replace(
  /\/+$/,
  "",
);

const SIGNING_SECRET = (
  process.env.IRIS_SIGNING_SECRET ??
  process.env.LINER_SIGNING_SECRET ??
  ""
).trim();

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

interface WasmSignerExports {
  liner_alloc: (len: number) => number;
  liner_dealloc: (ptr: number, len: number) => void;
  liner_get_result_ptr: () => number;
  liner_get_result_len: () => number;
  liner_sign_request: (
    methodPtr: number,
    methodLen: number,
    pathPtr: number,
    pathLen: number,
    bodyPtr: number,
    bodyLen: number,
    timestamp: bigint,
    noncePtr: number,
    nonceLen: number,
  ) => number;
  memory: WebAssembly.Memory;
}

let wasmExports: WasmSignerExports | null = null;

function getWasmExports(): WasmSignerExports {
  if (wasmExports) return wasmExports;
  const module = new WebAssembly.Module(
    Buffer.from(SIGNER_WASM_BASE64, "base64"),
  );
  wasmExports = new WebAssembly.Instance(module, {}).exports as unknown as
    WasmSignerExports;
  return wasmExports;
}

function passStringToWasm(
  wasm: WasmSignerExports,
  value: string,
): { ptr: number; len: number; free: () => void } {
  const bytes = Buffer.from(value, "utf8");
  const ptr = wasm.liner_alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  return {
    ptr,
    len: bytes.length,
    free: () => wasm.liner_dealloc(ptr, bytes.length),
  };
}

function readWasmResult(wasm: WasmSignerExports): string {
  const ptr = wasm.liner_get_result_ptr();
  const len = wasm.liner_get_result_len();
  if (!ptr || len === 0) return "";
  return Buffer.from(
    new Uint8Array(wasm.memory.buffer, ptr, len),
  ).toString("utf8");
}

export function signWithSecret(
  secret: string,
  method: string,
  path: string,
  body: Buffer,
  timestamp: number,
  nonce: string,
): string {
  const bodySha256 = crypto.createHash("sha256").update(body).digest("hex");
  const canonical = `${method.toUpperCase().trim()}\n${path
    .split("?")[0]
    .trim()}\n${timestamp}\n${nonce}\n${bodySha256}`;
  return crypto
    .createHmac("sha256", secret)
    .update(canonical)
    .digest("base64url");
}

function signWithWasm(
  method: string,
  path: string,
  body: Buffer,
  timestamp: number,
  nonce: string,
): string {
  const wasm = getWasmExports();
  const methodBuf = passStringToWasm(wasm, method);
  const pathBuf = passStringToWasm(wasm, path.split("?")[0].trim());
  const bodyBuf = passStringToWasm(wasm, body.toString("utf8"));
  const nonceBuf = passStringToWasm(wasm, nonce);

  try {
    const code = wasm.liner_sign_request(
      methodBuf.ptr,
      methodBuf.len,
      pathBuf.ptr,
      pathBuf.len,
      bodyBuf.ptr,
      bodyBuf.len,
      BigInt(timestamp),
      nonceBuf.ptr,
      nonceBuf.len,
    );
    if (code !== 0) {
      throw new Error(`signer wasm rejected the request (code ${code})`);
    }
    return readWasmResult(wasm);
  } finally {
    methodBuf.free();
    pathBuf.free();
    bodyBuf.free();
    nonceBuf.free();
  }
}

export function signRequestHeaders(
  method: string,
  path: string,
  body: Buffer,
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(8).toString("hex");
  const signature = SIGNING_SECRET
    ? signWithSecret(SIGNING_SECRET, method, path, body, timestamp, nonce)
    : signWithWasm(method, path, body, timestamp, nonce);

  return {
    "x-liner-signature": signature,
    "x-liner-timestamp": String(timestamp),
    "x-liner-nonce": nonce,
  };
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "*, content-range, content-length, etag",
    "access-control-max-age": "86400",
  };
}

function sendJson(
  res: NodeResponse,
  status: number,
  payload: unknown,
): void {
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

function upstreamPath(url: string): string {
  const withoutPrefix = url.startsWith(PROXY_PREFIX)
    ? url.slice(PROXY_PREFIX.length)
    : url;
  const path = withoutPrefix || "/";
  return path.startsWith("/") ? path : `/${path}`;
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
  const pathWithQuery = upstreamPath(req.url ?? "/");
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
    upstream = await fetch(`${UPSTREAM}${pathWithQuery}`, {
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
