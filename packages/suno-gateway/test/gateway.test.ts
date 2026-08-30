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
}

/** 最小 AxiosInstance 替身（拦截器 stub） */
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
          if (u.includes("/api/c/check")) return { data: { required: ctx.captcha }, status: 200, headers: {} };
          if (u.includes("/api/billing/info/")) return { data: { total_credits_left: ctx.credits, period: "m", monthly_limit: 100, monthly_usage: 10 }, status: 200, headers: {} };
          if (u.includes("/api/generate/v2/")) return { data: { clips: [{ id: "c1", title: "t", audio_url: "", status: "queued", metadata: {} }] }, status: 200, headers: {} };
          if (u.includes("cdn.example")) return { data: Buffer.from("RIFF-test"), status: 200, headers: {} };
          if (u.includes("/api/clip/")) return { data: { id: "c1", status: "complete", audio_url: "https://studio-api.prod.suno.com/api/forbidden", media_urls: [{ url: "https://cdn1.suno.ai/c1.mp3" }, { url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/c1.m4a" }] }, status: 200, headers: {} };
          if (u.includes("/api/feed/v2")) return { data: { clips: [{ id: "c1", title: "t", audio_url: "https://cdn.example/c1.mp3", status: ctx.feedStatus, created_at: "x", model_name: "m", metadata: { prompt: "p", duration: "3:00" }, duration: "3:00" }] }, status: 200, headers: {} };
          if (u.includes("clerk.suno.com") || u.includes("auth.suno.com")) return { data: { response: { last_active_session_id: "sid1" } }, status: 200, headers: {} };
          if (u.includes("/v1/client")) return { data: { response: { last_active_session_id: "sid1" } }, status: 200, headers: {} };
          if (u.includes("/sessions/")) return { data: { jwt: "tok" }, status: 200, headers: {} };
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
    assert.equal(res.sourceFormat, "mp3");
    assert.ok(res.audioUrl.startsWith("https://cdn1.suno.ai/") || res.audioUrl.startsWith("https://d2lwuy8qc234o3"), "远程源链接交付（浏览器会话播放）");
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
  assert.ok(res.audioUrl.includes("cdn1.suno.ai") || res.audioUrl.includes("cloudfront"));
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
