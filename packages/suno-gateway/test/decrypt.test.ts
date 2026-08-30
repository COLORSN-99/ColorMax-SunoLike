import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCtrCounter, decryptClipAudio, type DrmApi, type RightsResponse } from "../src/decrypt.ts";

/** 自证夹具：SHA-256('test-user') 作 userKey，构造 wrapped key/iv + CTR 密文 → 解密 → 应还原明文 */
test("D1 解密链自证：GCM unwrap + CTR 还原 ftyp 前缀", async () => {
  const sub = globalThis.crypto.subtle;
  const te = new TextEncoder();
  const contentId = "clip-test-1";
  const jwt = "test-user";
  // 生成内容密钥（mock rights 服务行为）
  const ctrKeyRaw = new Uint8Array(16).fill(7);
  const ctrIvRaw = new Uint8Array(16);
  for (let i = 0; i < 16; i++) ctrIvRaw[i] = i + 1;
  // mock serverside: userKey=sha256(jwt)
  const d = await sub.digest("SHA-256", te.encode(jwt));
  const userKey = await sub.importKey("raw", d, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const wrap = async (raw: Uint8Array) => {
    const iv = new Uint8Array(12).fill(9);
    const ct = await sub.encrypt({ name: "AES-GCM", iv, additionalData: te.encode(contentId) }, userKey, raw);
    const out = new Uint8Array(iv.length + ct.byteLength);
    out.set(iv);
    out.set(new Uint8Array(ct), iv.length);
    return Buffer.from(out).toString("base64");
  };
  const rights: RightsResponse = {
    key: await wrap(ctrKeyRaw),
    iv: await wrap(ctrIvRaw),
  };
  // mock api
  const api: DrmApi = {
    getJwt: () => jwt,
    fetchRights: async () => rights,
  };
  // 明文（mp4 ftyp 前缀 + 填充）
  const plain = Buffer.concat([
    Buffer.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70]),
    Buffer.alloc(8, 3),
  ]);
  // CTR encrypt
  const ctrKey = await sub.importKey("raw", ctrKeyRaw, { name: "AES-CTR" }, false, ["encrypt"]);
  const enc = new Uint8Array(plain.length);
  for (let b = 0; b * 16 < plain.length; b++) {
    const pt = await sub.encrypt(
      { name: "AES-CTR", counter: buildCtrCounter(ctrIvRaw, b), length: 128 },
      ctrKey,
      new Uint8Array(plain.subarray(b * 16, b * 16 + 16)),
    );
    enc.set(new Uint8Array(pt), b * 16);
  }
  const decrypted = await decryptClipAudio(api, contentId, enc);
  assert.ok(decrypted.subarray(4, 8).toString() === "ftyp", "还原 ftyp");
  assert.deepEqual(decrypted, plain);
});

test("D2 counter 大端递增", () => {
  const iv = new Uint8Array(16).fill(0);
  assert.equal(buildCtrCounter(iv, 0)[15], 0);
  assert.equal(buildCtrCounter(iv, 1)[15], 1);
  const c = buildCtrCounter(iv, 256);
  assert.equal(c[14], 1);
  assert.equal(c[15], 0);
});
