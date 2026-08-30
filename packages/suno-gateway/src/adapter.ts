import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { detectSystemProxy } from "./proxy.ts";
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

  /** 默认 transport：自动注入系统代理（浏览器可达但直连被墙的场景） */
  private transport(): AxiosInstance {
    if (this.opts.transport) return this.opts.transport;
    const proxy = detectSystemProxy();
    return axios.create({
      timeout: 15_000,
      ...(proxy ? { proxy: { host: proxy.host, port: proxy.port, protocol: "http" } } : {}),
    });
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
      transport: this.transport(),
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

    // 兜底轮询（wait_audio 内部已轮询到 waitAudioMs；feed 仅确认状态）
    const final = (await api.get([primary.id])).find((a) => a.status === "complete");
    if (!final) throw new Error("音频未就绪（轮询超时）");

    // 二次开发点⑪: feed 不含 media_urls（audio_url 恒为 forbidden 占位）——经 /api/clip/{id} 详情取真实音频源
    const detail = (await api.getClip(final.id)) as Record<string, unknown>;
    const sources = this.resolveSources(detail);
    if (sources.length === 0) throw new Error("音频源缺失（详情接口 media_urls 未就绪）");
    const ext = this.detectExt(sources[0]);
    // 二次开发点⑫: 源格式音频由客户端浏览器会话播放/下载交付（Suno 对自动化下载 policy 封锁：
    // cdn1 socket hang up / cloudfront 加密 blob；浏览器上下文=放行环境，<audio>/<a download> 无需 CORS）
    return {
      audioUrl: sources[0],
      sourceFormat: ext as "mp3" | "wav" | "flac",
      durationSec: Number(final.duration ?? req.durationSec) || req.durationSec,
      raw: final as unknown as Record<string, unknown>,
    };
  }

  /** 从 clip 对象提取全部可用音频源（cloudfront m4a 首选：cdn1.suno.ai 对服务器 IP 403；audio_url 兜底） */
  private resolveSources(clip: Record<string, unknown>): string[] {
    const urls: Array<{ url?: string }> = (clip.media_urls as Array<{ url?: string }>) ?? [];
    const list = urls.map((u) => u.url).filter((u): u is string => Boolean(u));
    list.sort((a, b) => (b.includes("cloudfront") ? 1 : 0) - (a.includes("cloudfront") ? 1 : 0));
    const direct = clip.audio_url as string | undefined;
    if (direct && !direct.includes("forbidden")) list.push(direct);
    return [...new Set(list)];
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

  /** 二次开发点⑨: 多源下载容错（mp3 域被拦时回退 m4a/其他 media_urls） */
  private async download(urls: string[]): Promise<Buffer> {
    let lastErr: unknown;
    for (const url of urls) {
      try {
        const res = await this.transport().get(url, { responseType: "arraybuffer", timeout: 30_000, headers: { Referer: "https://suno.com/", "User-Agent": "Mozilla/5.0" } });
        return Buffer.from(res.data as ArrayBuffer);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("音频下载失败（所有源均不可达）");
  }
}
