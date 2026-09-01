/**
 * R1 ⑯ 指纹 A/B 探针（只读，不触发生成）：真实 cookie 下 hybrid/web 两档交替打
 * ① sunoApi init（clerk 认证链路是否接受该头族画像）② c/check 闸门 required 命中率。
 * 输出 .data/gate-probe.jsonl（A3 触发率埋点基线数据）。
 * 用法：cd apps/web && node --env-file=.env.local ../scripts/gate-probe.mjs [轮数=3]
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "packages/suno-gateway/package.json")); // 经 workspace 包解析 axios
const axios = require("axios");
const { sunoApi, detectSystemProxy } = await import(join(root, "packages/suno-gateway/src/index.ts"));

mkdirSync(join(root, ".data"), { recursive: true });

const cookies = (process.env.SUNO_COOKIES ?? "").split("||")[0]?.trim();
if (!cookies) { console.error("SUNO_COOKIES 未配置（用 --env-file=.env.local 从 apps/web 运行）"); process.exit(1); }
const rounds = Number(process.argv[2] ?? 3);
const proxy = detectSystemProxy();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = join(root, ".data", "gate-probe.jsonl");

async function probe(fingerprint) {
  const transport = axios.create({
    timeout: 15_000,
    ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" } } : {}),
  });
  const t0 = Date.now();
  try {
    const api = await sunoApi(cookies, { transport, fingerprint }); // init()=clerk 认证链
    const initMs = Date.now() - t0;
    const gate = await api.captchaGate();
    return { fingerprint, ok: true, initMs, required: gate.required, version: gate.version };
  } catch (e) {
    return { fingerprint, ok: false, ms: Date.now() - t0, error: String(e instanceof Error ? e.message : e).slice(0, 140) };
  }
}

console.log(`探针开始：hybrid/web ×${rounds}，代理=${proxy ? `${proxy.host}:${proxy.port}` : "无"}`);

// ⑱ --wait 人工等待模式：持续轮询直到闸门放行（上限 10min）——配合浏览器过验证实测续跑
if (process.argv.includes("--wait")) {
  const api = await sunoApi(cookies, { transport: axios.create({ timeout: 15_000, ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" } } : {}) }) });
  const t0 = Date.now();
  const TTL = 600_000;
  console.log("等待人工验证（浏览器完成 suno.com/create 一次验证即自动放行）…");
  for (;;) {
    const g = await api.captchaGate();
    const el = Math.round((Date.now() - t0) / 1000);
    console.log(`+${el}s required=${g.required} v=${g.version ?? "?"}`);
    if (!g.required) { console.log("✓ 闸门放行——创作室发一条生成请求即可续跑"); break; }
    if (Date.now() - t0 > TTL) { console.log("✗ 10min 超时仍 required"); process.exit(2); }
    await sleep(5000);
  }
  process.exit(0);
}

const results = [];
for (let i = 0; i < rounds; i++) {
  for (const fp of ["hybrid", "web"]) {
    const r = { t: new Date().toISOString(), round: i + 1, ...await probe(fp) };
    results.push(r);
    appendFileSync(out, JSON.stringify(r) + "\n");
    console.log(`R${i + 1} ${fp.padEnd(6)} →`, JSON.stringify(r).slice(0, 160));
    await sleep(2500);
  }
}
const stat = (fp) => {
  const rs = results.filter((r) => r.fingerprint === fp);
  const ok = rs.filter((r) => r.ok);
  return {
    档: fp, n: rs.length, 认证通过: `${ok.length}/${rs.length}`,
    闸门命中: ok.length ? `${ok.filter((r) => r.required).length}/${ok.length}` : "-",
    平均init_ms: ok.length ? Math.round(ok.reduce((s, r) => s + r.initMs, 0) / ok.length) : "-",
  };
};
console.table([stat("hybrid"), stat("web")]);
