import type { AxiosInstance } from "axios";

/** 二次开发点⑬: Suno 加密音频解密（逆向自 suno.com web bundle：
 * userKey=SHA-256(JWT) AES-GCM；rights 返回 wrapped key/iv（GCM unwrap, additionalData=contentId）；
 * content 密文为 AES-CTR(16B big-endian counter 逐块) 加密——Progressive 播放流水线复刻 */
export interface RightsResponse {
  key: string;
  iv: string;
  glt?: string;
}

export interface DrmApi {
  getJwt(): string | undefined;
  fetchRights(contentId: string, contentType?: string): Promise<RightsResponse>;
}

const subtle = globalThis.crypto.subtle;
const te = new TextEncoder();
const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveUserKey(jwt: string): Promise<CryptoKey> {
  const d = await subtle.digest("SHA-256", te.encode(jwt));
  return subtle.importKey("raw", Buffer.from(d), { name: "AES-GCM" }, false, ["decrypt"]);
}

async function unwrap(b64: string, contentId: string, userKey: CryptoKey): Promise<Uint8Array> {
  const w = fromB64(b64);
  const raw = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(w.slice(0, 12)), additionalData: te.encode(contentId) },
    userKey,
    Buffer.from(w.slice(12)),
  );
  return new Uint8Array(raw);
}

export function buildCtrCounter(iv: Uint8Array, idx: number): Uint8Array {
  const c = new Uint8Array(16);
  c.set(iv.subarray(0, 16));
  let n = BigInt(0);
  for (let i = 0; i < 16; i++) n = (n << BigInt(8)) | BigInt(c[i]);
  n += BigInt(idx);
  for (let i = 15; i >= 0; i--) {
    c[i] = Number(n & BigInt(255));
    n >>= BigInt(8);
  }
  return c;
}

/** 解密 clip 音频：encrypted = 服务器下载的密文 bytes → 明文 audio bytes */
export async function decryptClipAudio(
  api: DrmApi,
  contentId: string,
  encrypted: Uint8Array,
): Promise<Buffer> {
  const jwt = api.getJwt();
  if (!jwt) throw new Error("缺少 auth token（会话失效？）");
  const userKey = await deriveUserKey(jwt);
  const rights = await api.fetchRights(contentId);
  const ctrKeyRaw = await unwrap(rights.key, contentId, userKey);
  const ctrIvRaw = await unwrap(rights.iv, contentId, userKey);
  const ctrKey = await subtle.importKey("raw", Buffer.from(ctrKeyRaw), { name: "AES-CTR" }, false, ["decrypt"]);

  // WebCrypto AES-CTR 按 NIST SP800-38A 对整批输入连续递增 counter（等价逐块 counter=iv+块号），单次解密
  // 注：TS5.7 Uint8Array 泛型与 BufferSource 不兼容，用 Node Buffer 中转（含 ArrayBuffer 视图）
  const data = Buffer.from(encrypted);
  const ivBuf = Buffer.from(ctrIvRaw);
  const pt = await subtle.decrypt(
    { name: "AES-CTR", counter: ivBuf, length: 128 },
    ctrKey,
    data,
  );
  return Buffer.from(new Uint8Array(pt));
}
