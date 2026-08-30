import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AxiosInstance } from "axios";
import { sunoApi, CaptchaRequiredError, DEFAULT_MODEL } from "../vendor/SunoApi.ts";
import { CookiePool } from "./pool.ts";

/** 二次开发：以 vendor suno-api 为基座的本地 Suno 出歌适配器（EngineAdapter 兼容形态） */

export class SunoQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SunoQuotaError";
  }
}

export interface SunoGatewayOptions {
  cookies: string[];
  publicDir: string;
  transport?: AxiosInstance;
  waitAudioMs?: number;
}

export interface SunoRenderRequest {
  title: string;
  lyrics: string[];
  arrangement: { key: string; bpm: number; chordProgression: string[]; groove: string };
  seed: number;
  durationSec: number;
}

export interface SunoRenderResult {
  audioUrl: string;
  sourceFormat: "mp3" | "wav" | "flac";
  durationSec: number;
  raw: Record<string, unknown>;
}

const AUTH_ERROR_PATTERN = /(invalid|expired|cookie|unauthorized|401|429)/i;

export class SunoGatewayAdapter {
  private opts: SunoGatewayOptions;
  constructor(opts: SunoGatewayOptions) {
    this.opts = opts;
  }

  async render(req: SunoRenderRequest): Promise<SunoRenderResult> {
    const pool = new CookiePool(this.opts.cookies);
    let lastErr: unknown;
    for (let attempt = 0; attempt < pool.size; attempt++) {
      const cookie = pool.next();
      if (!cookie) break;
      try {
        return await this.tryRender(cookie, req);
      } catch (e) {
        const kind = e instanceof CaptchaRequiredError || e instanceof SunoQuotaError || this.isAuthError(e);
        lastErr = e;
        if (kind) {
          pool.disable(cookie); // 会话失效/风控 → 剔除并轮换
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new SunoQuotaError("cookie 池耗尽");
  }

  private async tryRender(cookie: string, req: SunoRenderRequest): Promise<SunoRenderResult> {
    const api = await sunoApi(cookie, {
      transport: this.opts.transport,
      waitAudioMs: this.opts.waitAudioMs,
    });
    // 配额预检（get_limit 等价：/api/billing/info/）
    const credits = (await api.get_credits()) as { credits_left: number };
    if (credits.credits_left <= 0) throw new SunoQuotaError(`配额耗尽（剩余 ${credits.credits_left}）`);

    // custom_generate（计划驱动：lyrics 全文 + 风格/调性/节奏型 tags）
    const tags = [req.arrangement.groove, `${req.arrangement.key}调`, ...req.arrangement.chordProgression].join("、");
    const prompt =
      req.lyrics.join("\n") +
      `\n\n[创作约束] 调性=${req.arrangement.key}，速度=${req.arrangement.bpm}bpm，节奏型=${req.arrangement.groove}，目标时长≈${req.durationSec}s`;
    const songs = await api.custom_generate(prompt, tags, req.title, false, DEFAULT_MODEL, true);
    const [primary] = songs;
    if (!primary) throw new Error("Suno 未返回作品");

    // 兜底轮询（wait_audio 内部已轮询到 waitAudioMs；此处以 feed 再对齐最终态）
    const final = (await api.get([primary.id])).find((a) => a.status === "complete");
    if (!final?.audio_url) throw new Error("音频未就绪（轮询超时）");

    const ext = this.detectExt(final.audio_url);
    const fileName = `suno_${req.title.slice(0, 40).replace(/[^\w\u4e00-\u9fff-]+/g, "_")}_${req.seed}.${ext}`;
    if (!existsSync(this.opts.publicDir)) await mkdir(this.opts.publicDir, { recursive: true });
    const buf = await this.download(final.audio_url);
    await writeFile(join(this.opts.publicDir, fileName), buf);

    return {
      audioUrl: `/generated/${fileName}`,
      sourceFormat: ext as "mp3" | "wav" | "flac",
      durationSec: Number(final.duration ?? req.durationSec) || req.durationSec,
      raw: final as unknown as Record<string, unknown>,
    };
  }

  private isAuthError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    return AUTH_ERROR_PATTERN.test(msg);
  }

  private detectExt(audioUrl: string): string {
    const m = audioUrl.split("?")[0]!;
    const ext = m.match(/\.(\w+)$/)?.[1];
    if (ext && ["mp3", "wav", "flac"].includes(ext)) return ext;
    return "mp3";
  }

  private async download(url: string): Promise<Buffer> {
    if (this.opts.transport) {
      const res = await this.opts.transport.get(url, { responseType: "arraybuffer" });
      return Buffer.from(res.data as ArrayBuffer);
    }
    const res = await fetch(url, { headers: { "User-Agent": "colormax/0.1" } });
    if (!res.ok) throw new Error(`音频下载失败 HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}
