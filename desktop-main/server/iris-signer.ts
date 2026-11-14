import crypto from "node:crypto";
import { SIGNER_WASM_BASE64 } from "./iris-signer-wasm";

/**
 * Server-side twin of `electron/crypto.ts`, used by the Vercel proxy.
 *
 * Canonical string (identical to the desktop signer):
 *   METHOD \n path-without-query \n timestamp \n nonce \n sha256hex(body)
 *   signature = base64url(HMAC-SHA256(secret, canonical))
 *
 * The key is `IRIS_SIGNING_SECRET` / `LINER_SIGNING_SECRET` when the deployment
 * defines it, otherwise the obfuscated production key inside the signer WASM, so
 * the proxy signs correctly with no secret to copy into Vercel.
 */

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
  return Buffer.from(new Uint8Array(wasm.memory.buffer, ptr, len)).toString(
    "utf8",
  );
}

export function getSigningSecret(): string {
  return (
    process.env.IRIS_SIGNING_SECRET ??
    process.env.LINER_SIGNING_SECRET ??
    ""
  ).trim();
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

export function signWithWasm(
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
  const secret = getSigningSecret();
  const signature = secret
    ? signWithSecret(secret, method, path, body, timestamp, nonce)
    : signWithWasm(method, path, body, timestamp, nonce);

  return {
    "x-liner-signature": signature,
    "x-liner-timestamp": String(timestamp),
    "x-liner-nonce": nonce,
  };
}
