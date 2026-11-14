import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveUpstreamPath } from "../../../api/index";

interface Received {
  url?: string;
  method?: string;
  signature?: string;
  nonce?: string;
  timestamp?: string;
  userAgent?: string;
}

const received: Received = {};

let upstreamServer: http.Server;
let proxyServer: http.Server;
let upstreamUrl = "";
let proxyUrl = "";

beforeAll(async () => {
  upstreamServer = http.createServer((req, res) => {
    received.url = req.url;
    received.method = req.method;
    received.signature = req.headers["x-liner-signature"] as string;
    received.nonce = req.headers["x-liner-nonce"] as string;
    received.timestamp = req.headers["x-liner-timestamp"] as string;
    received.userAgent = req.headers["user-agent"] as string;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise<void>((resolve) =>
    upstreamServer.listen(0, "127.0.0.1", resolve),
  );
  const upstreamPort = (upstreamServer.address() as { port: number }).port;
  upstreamUrl = `http://127.0.0.1:${upstreamPort}`;

  process.env.IRIS_API_UPSTREAM = upstreamUrl;
  process.env.IRIS_SIGNING_SECRET = "integration-secret";
  const { default: handler } = await import("../../../api/index");

  proxyServer = http.createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));
  const proxyPort = (proxyServer.address() as { port: number }).port;
  proxyUrl = `http://127.0.0.1:${proxyPort}`;
});

afterAll(async () => {
  delete process.env.IRIS_API_UPSTREAM;
  delete process.env.IRIS_SIGNING_SECRET;
  await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
  await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
});

describe("api function", () => {
  it("forwards /api/v1/... to the upstream path and signs it", async () => {
    const response = await fetch(`${proxyUrl}/api/v1/health?probe=1`);
    const body = (await response.json()) as { ok: boolean; path: string };

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toEqual({ ok: true, path: "/v1/health?probe=1" });
    expect(received.method).toBe("GET");
    expect(received.url).toBe("/v1/health?probe=1");
    expect(received.signature).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(received.nonce).toMatch(/^[0-9a-f]{16}$/);
    expect(received.timestamp).toMatch(/^\d{10}$/);
    expect(received.userAgent).toBeTruthy();
  });

  it("rebuilds the upstream path from the vercel rewrite parameter", () => {
    // /api/v1/health?page=2 -> /api/index?__iris_path=v1/health&page=2
    expect(resolveUpstreamPath("/api/index?__iris_path=v1/health&page=2")).toBe(
      "/v1/health?page=2",
    );
    // platform keeping the original URL
    expect(resolveUpstreamPath("/api/v1/health?page=2")).toBe(
      "/v1/health?page=2",
    );
    // bare entries
    expect(resolveUpstreamPath("/api")).toBe("/");
    expect(resolveUpstreamPath("/api/index")).toBe("/");
    // unsubstituted capture group must never leak into the upstream path
    expect(resolveUpstreamPath("/api/index?__iris_path=$1")).toBe("/");
  });

  it("answers CORS preflight without touching the upstream", async () => {
    const response = await fetch(`${proxyUrl}/api/v1/health`, {
      method: "OPTIONS",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});
