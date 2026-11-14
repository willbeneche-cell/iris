import { describe, expect, it } from "vitest";
import { signWithSecret as desktopSign } from "../../../electron/crypto";
import {
  signRequestHeaders,
  signWithSecret as proxySign,
} from "../../../api/[...path]";

describe("vercel proxy signer", () => {
  it("matches the desktop canonical signature", () => {
    const secret = "test-secret";
    const cases: { method: string; path: string; body: string }[] = [
      { method: "GET", path: "/v1/tracks/abc", body: "" },
      { method: "get", path: "/v1/search?q=daft+punk", body: "" },
      {
        method: "POST",
        path: "/v1/me/playback",
        body: JSON.stringify({ trackId: "abc", positionMs: 1234 }),
      },
    ];
    for (const item of cases) {
      const timestamp = 1_760_000_000;
      const nonce = "0123456789abcdef";
      expect(
        proxySign(
          secret,
          item.method,
          item.path,
          Buffer.from(item.body),
          timestamp,
          nonce,
        ),
      ).toBe(
        desktopSign(
          secret,
          item.method,
          item.path,
          item.body,
          timestamp,
          nonce,
        ),
      );
    }
  });

  it("signs with the bundled signer wasm when no secret is configured", () => {
    delete process.env.IRIS_SIGNING_SECRET;
    delete process.env.LINER_SIGNING_SECRET;

    const headers = signRequestHeaders("GET", "/v1/tracks/abc", Buffer.alloc(0));

    expect(headers["x-liner-signature"]).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(headers["x-liner-timestamp"]).toMatch(/^\d{10}$/);
    expect(headers["x-liner-nonce"]).toMatch(/^[0-9a-f]{16}$/);
  });
});
