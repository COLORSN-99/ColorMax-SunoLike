import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AxiosInstance } from "axios";
import { SunoAdapter } from "../src/suno.ts";

function stubTransport(ctx: { credits: number; captcha: boolean; feedStatus: string }): AxiosInstance {
  const base = { interceptors: { request: { use: () => 0, eject: () => 0, clear: () => 0 }, response: { use: () => 0, eject: () => 0, clear: () => 0 } } } as unknown as AxiosInstance;
  return new Proxy(base, {
    get(t, prop) {
      if (prop === "get" || prop === "post")
        return async (url: string) => {
          const u = String(url);
          if (u.includes("/api/c/check")) return { data: { required: ctx.captcha }, status: 200, headers: {} };
          if (u.includes("/api/billing/info/")) return { data: { total_credits_left: ctx.credits }, status: 200, headers: {} };
          if (u.includes("/api/generate/v2/")) return { data: { clips: [{ id: "c1", status: "queued" }] }, status: 200, headers: {} };
          if (u.includes("cdn.example")) return { data: Buffer.from("RIFF-test"), status: 200, headers: {} };
          if (u.includes("/api/clip/")) return { data: { id: "c1", status: "complete", audio_url: "https://studio-api.prod.suno.com/api/forbidden", media_urls: [{ url: "https://cdn1.suno.ai/c1.mp3" }, { url: "https://d2lwuy8qc234o3.cloudfront.net/1/clip/c1.m4a" }] }, status: 200, headers: {} };
          if (u.includes("/api/feed/v2")) return { data: { clips: [{ id: "c1", audio_url: "https://cdn.example/c1.mp3", status: ctx.feedStatus, duration: "3:00", metadata: {} }] }, status: 200, headers: {} };
          if (u.includes("auth.suno.com")) return { data: { response: { last_active_session_id: "s" } }, status: 200, headers: {} };
          if (u.includes("/sessions/")) return { data: { jwt: "t" }, status: 200, headers: {} };
          return { data: {}, status: 200, headers: {} };
        };
      return (t as Record<string, unknown>)[prop as string];
    },
  }) as AxiosInstance;
}

test("G6-engine SunoAdapter 通过 EngineAdapter 形态出歌", async () => {
  const ctx = { credits: 10, captcha: false, feedStatus: "complete" };
  const dir = mkdtempSync(join(tmpdir(), "g6-"));
  try {
    const adapter = new SunoAdapter({
      cookies: ["__client=xx; ajs_anonymous_id=d6"],
      publicDir: join(dir, "generated"),
      transport: stubTransport(ctx),
      waitAudioMs: 800,
    });
    const res = await adapter.render({
      title: "歌", lyrics: ["a", "b"],
      arrangement: { key: "C", bpm: 100, chordProgression: ["C-G-Am-F"], groove: "pop" },
      seed: 7, durationSec: 180,
    });
    assert.equal(res.sourceFormat, "mp3");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
