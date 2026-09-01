import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AxiosInstance, AxiosRequestConfig } from "axios";
import { SunoGatewayAdapter, SunoQuotaError, CaptchaRequiredError, CookiePool } from "../src/index.ts";

interface MockCtx {
  credits: number;
  captcha: boolean;
  feedStatus: string;
  calls: { url: string; method: string }[];
  /** ⑱ 人工等待模拟：前 N 次 c/check 返回 required=true，之后放行 */
  gatePassAfter?: number;
}

/** 最小 AxiosInstance 替身（拦截器 stub） */

const RIGHTS_FIXTURE = await (async () => {
  const sub = globalThis.crypto.subtle;
  const te = new TextEncoder();
  const d = await sub.digest("SHA-256", te.encode("tok"));
  const userKey = await sub.importKey("raw", d, { name: "AES-GCM" }, false, ["encrypt"]);
  const ctrKeyRaw = new Uint8Array(16).fill(7);
  const ctrIvRaw = new Uint8Array(16).map((_, i) => i + 1);
  const wrap = async (raw: Uint8Array) => {
    const iv = new Uint8Array(12).fill(9);
    const ct = await sub.encrypt({ name: "AES-GCM", iv, additionalData: te.encode("c1") }, userKey, raw);
    const o = new Uint8Array(iv.length + ct.byteLength);
    o.set(iv); o.set(new Uint8Array(ct), iv.length);
    return Buffer.from(o).toString("base64");
  };
  return { key: await wrap(ctrKeyRaw), iv: await wrap(ctrIvRaw) };
})();

function stubTransport(ctx: MockCtx): AxiosInstance {
  const base: AxiosInstance = {
    interceptors: { request: { use: () => 0, eject: () => 0, clear: () => 0 }, response: { use: () => 0, eject: () => 0, clear: () => 0 } },
  } as unknown as AxiosInstance;
  return new Proxy(base, {
    get(target, prop) {
      if (prop === "get" || prop === "post") {
        return async (url: string) => {
          const u = String(url);
          ctx.calls.push({ url: u, method: String(prop) });
          if (u.includes("/api/c/check")) {
            let required = ctx.captcha;
            if (typeof ctx.gatePassAfter === "number") {
              const checks = ctx.calls.filter((c) => c.url.includes("/api/c/check")).length;
              required = checks <= ctx.gatePassAfter; // 第 N+1 次起放行
            }
            return { data: { required, captcha_version: 2 }, status: 200, headers: {} };
          }
          if (u.includes("/api/billing/info/")) return { data: { total_credits_left: ctx.credits, period: "m", monthly_limit: 100, monthly_usage: 10 }, status: 200, headers: {} };
          if (u.includes("/api/mango/rights")) return { data: RIGHTS_FIXTURE, status: 200, headers: {} };
          if (u.includes("/api/generate/v2/")) return { data: { clips: [{ id: "c1", title: "t", audio_url: "", status: "queued", metadata: {} }] }, status: 200, headers: {} };
          if (u.includes("cloudfront") || u.includes("cdn.example")) return { data: Buffer.alloc(32, 5), status: 200, headers: {} };
          if (u.includes("cdn.example")) return { data: Buffer.from("RIFF-test"), status: 200, headers: {} };
          if (u.includes("/api/clip/")) return { data: { id: "c1", status: "complete", audio_url: "https://studio-api.prod.suno.com/api/forbidden", media_urls: [{ url: "https://cdn1.suno.ai/c1.mp3" }, { url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/c1.m4a" }] }, status: 200, headers: {} };
          if (u.includes("/api/feed/v2")) return { data: { clips: [{ id: "c1", title: "t", audio_url: "https://cdn.example/c1.mp3", status: ctx.feedStatus, created_at: "x", model_name: "m", metadata: { prompt: "p", duration: "3:00" }, duration: "3:00" }] }, status: 200, headers: {} };
          if (u.includes("/sessions/")) return { data: { jwt: "tok" }, status: 200, headers: {} };
          if (u.includes("/v1/client")) return { data: { response: { last_active_session_id: "sid1" } }, status: 200, headers: {} };
          if (u.includes("clerk.suno.com") || u.includes("auth.suno.com")) return { data: { response: { last_active_session_id: "sid1" } }, status: 200, headers: {} };
          return { data: {}, status: 200, headers: {} };
        };
      }
      return (target as Record<string, unknown>)[prop as string];
    },
  }) as AxiosInstance;
}

const REQ = {
  title: "妈妈的歌",
  lyrics: ["verse 歌词", "chorus 歌词"],
  arrangement: { key: "C", bpm: 100, chordProgression: ["C-G-Am-F"], groove: "pop" },
  seed: 42,
  durationSec: 180,
};

test("G1 契约：render 全链（quota→generate→poll→源格式下载）", async () => {
  const ctx: MockCtx = { credits: 10, captcha: false, feedStatus: "complete", calls: [] };
  const dir = mkdtempSync(join(tmpdir(), "g1-"));
  try {
    const adapter = new SunoGatewayAdapter({
      cookies: ["__client=xx; ajs_anonymous_id=d1"],
      publicDir: join(dir, "generated"),
      transport: stubTransport(ctx),
      waitAudioMs: 800,
    });
    const res = await adapter.render(REQ);
    assert.equal(res.sourceFormat, "m4a");
    assert.ok(res.audioUrl.startsWith("/generated/"), "解密后同源交付");
    const f = join(dir, "generated", res.audioUrl.replace(/^\/generated\//, ""));
    assert.ok(existsSync(f) && statSync(f).size > 0, "解密音频落盘");
    assert.ok(ctx.calls.some((c) => c.url.includes("/api/generate/v2/")), "custom_generate 命中");
    assert.ok(ctx.calls.some((c) => c.url.includes("/api/feed/v2")), "poll 命中");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("G2 配额 0 → SunoQuotaError", async () => {
  const ctx: MockCtx = { credits: 0, captcha: false, feedStatus: "complete", calls: [] };
  const adapter = new SunoGatewayAdapter({
    cookies: ["__client=xx; ajs_anonymous_id=d2"],
    publicDir: mkdtempSync(join(tmpdir(), "g2-")),
    transport: stubTransport(ctx),
  });
  await assert.rejects(adapter.render(REQ), SunoQuotaError);
});

test("G3 captcha 触发 → 轮换 cookie（第 1 个剔除后第 2 个成功）", async () => {
  const ctx: MockCtx = { credits: 10, captcha: true, feedStatus: "complete", calls: [] };
  let captchaFirst = true;
  const dir = mkdtempSync(join(tmpdir(), "g3-"));
  // 第 1 个 cookie 触发 captcha → fail-fast；第 2 个 cookie 正常（mock 逐步关闭 captcha）
  const transport = stubTransport(ctx);
  const wrapped = new Proxy(transport, {
    get: (t, prop) => {
      if (prop === "post" || prop === "get") {
        return async (url: string) => {
          if (String(url).includes("/api/c/check")) {
            const first = captchaFirst;
            captchaFirst = false;
            return { data: { required: first }, status: 200, headers: {} };
          }
          const orig = (t as Record<string, unknown>)[prop as string] as (
            u: string,
          ) => Promise<unknown>;
          return orig(url);
        };
      }
      return (t as Record<string, unknown>)[prop as string];
    },
  }) as AxiosInstance;
  const adapter = new SunoGatewayAdapter({
    cookies: ["__client=a1; ajs_anonymous_id=x", "__client=a2; ajs_anonymous_id=y"],
    publicDir: join(dir, "generated"),
    transport: wrapped,
    waitAudioMs: 800,
  });
  const res = await adapter.render(REQ); // captcha cookie 失败 → 自动用第 2 个
  assert.ok(res.audioUrl.startsWith("/generated/"));
  const pool = new CookiePool(["a", "b"]);
  assert.equal(pool.next(), "a");
  pool.disable("a");
  assert.equal(pool.next(), "b");
  pool.disable("a");
  assert.equal(pool.usable, 1);
  rmSync(dir, { recursive: true, force: true });
});

test("G4 轮询超时（feed 一直 streaming → finite waitAudioMs 后抛错）", async () => {
  const ctx: MockCtx = { credits: 10, captcha: false, feedStatus: "streaming", calls: [] };
  const dir = mkdtempSync(join(tmpdir(), "g4-"));
  try {
    const adapter = new SunoGatewayAdapter({
      cookies: ["__client=xx; ajs_anonymous_id=d4"],
      publicDir: join(dir, "generated"),
      transport: stubTransport(ctx),
      waitAudioMs: 500,
    });
    await assert.rejects(adapter.render(REQ), /未就绪|超时/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("G5 CaptchaRequiredError 可直接捕获（fail-fast 语义）", () => {
  const e = new CaptchaRequiredError("captcha");
  assert.equal(e.name, "CaptchaRequiredError");
});

test("S6-T6 渲染事件透传：tool_call 步骤链 + vendor onPoll → suno_progress", async () => {
  const ctx: MockCtx = { credits: 10, captcha: false, feedStatus: "complete", calls: [] };
  const dir = mkdtempSync(join(tmpdir(), "s6t6-"));
  try {
    const adapter = new SunoGatewayAdapter({
      cookies: ["__client=xx; ajs_anonymous_id=d6"],
      publicDir: join(dir, "generated"),
      transport: stubTransport(ctx),
      waitAudioMs: 800,
    });
    const events: Array<Record<string, unknown>> = [];
    const res = await adapter.render(REQ, {
      callId: "suno-1",
      emit: (e) => events.push(e as unknown as Record<string, unknown>),
    });
    assert.ok(res.audioUrl.startsWith("/generated/"));
    const toolSeq = events.filter((e) => e.type === "tool_call").map((e) => `${e.tool}:${e.op}`);
    for (const expect of ["captchaGate:start", "quotaCheck:start", "customGenerate:start", "feedConfirm:start", "clipDetail:start", "download:start", "decrypt:start", "saveFile:start"]) {
      assert.ok(toolSeq.includes(expect), `缺步骤事件 ${expect}（实际 ${toolSeq.join(",")}）`);
    }
    assert.ok(toolSeq.includes("saveFile:end"), "全链 end 帧收尾");
    const progress = events.filter((e) => e.type === "suno_progress");
    assert.ok(progress.length >= 1, "轮询期至少一帧进度");
    const p = progress[0] as Record<string, unknown>;
    assert.equal(p.callId, "suno-1");
    assert.equal(p.stage, "poll");
    assert.equal(typeof p.elapsedMs, "number");
    assert.ok(toolSeq.every((t) => t.startsWith("captchaGate") || t.startsWith("quotaCheck") || t.startsWith("customGenerate") || t.startsWith("feedConfirm") || t.startsWith("clipDetail") || t.startsWith("download") || t.startsWith("decrypt") || t.startsWith("saveFile")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ===== R1 ⑯ 指纹对齐 + ⑰ 闸门预检 =====
import { buildSunoHeaders, chromeMajor } from "../src/index.ts";

test("G7-1 ⑯ 指纹头族：hybrid 保留上游 Android 标记（零回归）；web 全 macOS Chrome 自洽（无 app 标记）", () => {
  const hybrid = buildSunoHeaders("hybrid", "Mozilla/5.0 (Macintosh) Chrome/130.0.0.0 Safari/537.36", "dev-1");
  assert.equal(hybrid["X-Requested-With"], "com.suno.android");
  assert.equal(hybrid["sec-ch-ua-platform"], '"Android"');
  assert.equal(hybrid["sec-ch-ua-mobile"], "?1");
  assert.equal(hybrid["User-Agent"], "Mozilla/5.0 (Macintosh) Chrome/130.0.0.0 Safari/537.36"); // UA 逐字透传

  const web = buildSunoHeaders("web", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36");
  assert.equal(web["X-Requested-With"], undefined, "web 档无 Android app 标记");
  assert.equal(web["sec-ch-ua-platform"], '"macOS"');
  assert.equal(web["sec-ch-ua-mobile"], "?0");
  assert.ok(web["sec-ch-ua"]?.includes('v="139"'), "client-hints 版本从 UA 派生（自洽）");
  assert.ok(web["sec-ch-ua"]?.includes("Google Chrome"));
  assert.equal(web["Origin"], "https://suno.com");
  assert.ok(web["User-Agent"].includes("Chrome/139"));
});

test("G7-2 chromeMajor 版本派生", () => {
  assert.equal(chromeMajor("...Chrome/139.0.0.0 Safari..."), "139");
  assert.equal(chromeMajor("no chrome here"), "130"); // 兜底
});

test("G7-3 ⑱ 闸门人工等待·超时路径：持续 required → 轮询至 TTL 抛 CaptchaTimeoutError（不进 generate；captcha_wait waiting/timeout 帧）", async () => {
  const ctx: MockCtx = { credits: 10, captcha: true, feedStatus: "complete", calls: [] };
  const events: Array<Record<string, unknown>> = [];
  const adapter = new SunoGatewayAdapter({
    cookies: ["__client=xx; ajs_anonymous_id=g7"],
    publicDir: mkdtempSync(join(tmpdir(), "g7-")),
    transport: stubTransport(ctx),
    waitAudioMs: 500,
    captchaTtlMs: 150,
    captchaPollMs: 50,
  });
  await assert.rejects(
    adapter.render(REQ, { callId: "s7", emit: (e) => events.push(e as never) }),
    (e: unknown) => {
      assert.ok(e instanceof CaptchaRequiredError, "超时错误可作 CaptchaRequiredError 捕获（子类）");
      assert.equal((e as Error).name, "CaptchaTimeoutError");
      assert.ok(/CAPTCHA/.test((e as Error).message), "消息含 CAPTCHA 关键词（评审降级分类可命中）");
      return true;
    },
  );
  assert.ok(ctx.calls.some((c) => c.url.includes("/api/c/check")), "打过 c/check");
  assert.ok(ctx.calls.filter((c) => c.url.includes("/api/c/check")).length >= 2, "至少预检+一次轮询");
  assert.ok(!ctx.calls.some((c) => c.url.includes("/api/generate/v2/")), "required 期间不进 generate");
  const waits = events.filter((e) => e.type === "captcha_wait");
  assert.ok(waits.some((e) => e.phase === "waiting"), "waiting 帧已发射");
  assert.ok(waits.some((e) => e.phase === "timeout"), "timeout 帧已发射");
  assert.equal(waits[0].ttlMs, 150);
});

test("G7-3b ⑱ 闸门人工等待·放行路径：轮询到第 2 次验证通过 → passed 帧 + 自动续跑完整 render 交付", async () => {
  const ctx: MockCtx = { credits: 10, captcha: true, feedStatus: "complete", calls: [], gatePassAfter: 1 }; // 预检 true，第一次轮询放行
  const events: Array<Record<string, unknown>> = [];
  const dir = mkdtempSync(join(tmpdir(), "g7b-"));
  const adapter = new SunoGatewayAdapter({
    cookies: ["__client=xx; ajs_anonymous_id=g7b"],
    publicDir: join(dir, "generated"),
    transport: stubTransport(ctx),
    waitAudioMs: 800,
    captchaTtlMs: 5_000,
    captchaPollMs: 60,
  });
  const res = await adapter.render(REQ, { callId: "s7b", emit: (e) => events.push(e as never) });
  assert.ok(res.audioUrl.startsWith("/generated/"), "放行后自动完成出歌");
  const waits = events.filter((e) => e.type === "captcha_wait");
  assert.ok(waits.some((e) => e.phase === "passed"), "passed 帧");
  assert.ok(!waits.some((e) => e.phase === "timeout"), "未超时不应有 timeout 帧");
  assert.ok(ctx.calls.some((c) => c.url.includes("/api/generate/v2/")), "放行后进入 generate");
  rmSync(dir, { recursive: true, force: true });
});
