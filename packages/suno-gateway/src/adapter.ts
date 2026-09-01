import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AxiosInstance } from "axios";
import axios from "axios";
import type { AgentStreamEvent } from "@colormax/schema";
import { detectSystemProxy } from "./proxy.ts";
import { sunoApi, CaptchaRequiredError, CaptchaTimeoutError, DEFAULT_MODEL, type SunoFingerprint } from "../vendor/SunoApi.ts";
import { CookiePool } from "./pool.ts";
import { decryptClipAudio } from "./decrypt.ts";

/** 二次开发：以 vendor suno-api 为基座的本地 Suno 出歌适配器（EngineAdapter 兼容形态） */

export interface GatewayRenderHooks {
  emit?: (evt: AgentStreamEvent) => void;
  callId?: string;
}

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
  fingerprint?: SunoFingerprint; // ⑯ 指纹档（默认 hybrid=上游行为；web=全 macOS Chrome 自洽档）
  userAgent?: string;            // 与 cookie 导出浏览器一致时传入（A/B 探针用）
  captchaTtlMs?: number;         // ⑱ 人工验证等待上限（默认 10min；env SUNO_CAPTCHA_TTL_MS）
  captchaPollMs?: number;        // ⑱ 等待期 c/check 轮询间隔（默认 5s；env SUNO_CAPTCHA_POLL_MS）
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
  sourceFormat: "mp3" | "wav" | "flac" | "m4a";
  durationSec: number;
  raw: Record<string, unknown>;
}

const AUTH_ERROR_PATTERN = /(invalid|expired|cookie|unauthorized|401|429)/i;

/** ⑱ 默认人工验证等待参数（可 options/env 覆盖） */
export const CAPTCHA_WAIT_DEFAULTS = { ttlMs: 600_000, pollMs: 5_000 };
const waitConf = (opts: SunoGatewayOptions) => ({
  ttlMs: opts.captchaTtlMs ?? Number(process.env.SUNO_CAPTCHA_TTL_MS ?? CAPTCHA_WAIT_DEFAULTS.ttlMs),
  pollMs: opts.captchaPollMs ?? Number(process.env.SUNO_CAPTCHA_POLL_MS ?? CAPTCHA_WAIT_DEFAULTS.pollMs),
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  async render(req: SunoRenderRequest, hooks?: GatewayRenderHooks): Promise<SunoRenderResult> {
    const pool = new CookiePool(this.opts.cookies);
    let lastErr: unknown;
    for (let attempt = 0; attempt < pool.size; attempt++) {
      const cookie = pool.next();
      if (!cookie) break;
      try {
        return await this.tryRender(cookie, req, hooks);
      } catch (e) {
        const kind = e instanceof CaptchaRequiredError || e instanceof SunoQuotaError || this.isAuthError(e);
        lastErr = e;
        if (kind) {
          pool.disable(cookie); // 会话失效/风控 → 剔除并轮换
          hooks?.emit?.({
            type: "tool_call", callId: hooks.callId ?? "suno", node: "suno", tool: "cookieRotate",
            op: "log", level: "warn", message: `会话失效/风控，轮换下一 cookie（${e instanceof Error ? e.message.slice(0, 80) : ""}）`,
          });
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new SunoQuotaError("cookie 池耗尽");
  }

  /**
   * ⑱ 人工验证等待：闸门 required 时挂起轮询 c/check，用户在浏览器 suno.com/create 过一次验证
   * 后放行即自动续跑；TTL（默认 10min）超时抛 CaptchaTimeoutError（子类=cookie 轮换沿用）。
   * 期间 emit captcha_wait(waiting/passed/timeout) 帧供对话流渲染等待卡。
   */
  private async gateWait(
    api: { captchaGate(): Promise<{ required: boolean; version?: number }> },
    callId: string,
    hooks: GatewayRenderHooks | undefined,
    first: { required: boolean; version?: number },
  ): Promise<void> {
    const emit = (evt: AgentStreamEvent) => hooks?.emit?.(evt);
    const { ttlMs, pollMs } = waitConf(this.opts);
    const t0 = Date.now();
    emit({
      type: "captcha_wait", callId, phase: "waiting", elapsedMs: 0, ttlMs,
      note: `Suno 要求人工验证（captcha_version=${first.version ?? "?"}）：请在浏览器 suno.com/create 完成一次验证，通过后自动续跑（上限 ${Math.round(ttlMs / 60000)} 分钟）`,
    });
    let last = t0;
    for (;;) {
      await sleep(pollMs);
      const elapsedMs = Date.now() - t0;
      let g: { required: boolean; version?: number };
      try {
        g = await api.captchaGate();
      } catch (e) {
        g = { required: true }; // 探测异常按仍需处理，下一轮重试
        void e;
      }
      if (!g.required) {
        emit({ type: "captcha_wait", callId, phase: "passed", elapsedMs, ttlMs, note: "验证通过，继续生成" });
        return;
      }
      if (elapsedMs >= ttlMs) {
        emit({ type: "captcha_wait", callId, phase: "timeout", elapsedMs, ttlMs, note: "等待人工验证超时" });
        throw new CaptchaTimeoutError(
          `Suno 风控闸门（CAPTCHA）人工验证等待超时（${Math.round(ttlMs / 60000)} 分钟未检测通过）：请在浏览器完成 suno.com/create 验证后发送「继续」，或轮换 SUNO_COOKIES`,
        );
      }
      if (Date.now() - last >= 15_000) {
        last = Date.now();
        emit({ type: "captcha_wait", callId, phase: "waiting", elapsedMs, ttlMs, note: "仍待验证…" });
      }
    }
  }

  private async tryRender(cookie: string, req: SunoRenderRequest, hooks?: GatewayRenderHooks): Promise<SunoRenderResult> {
    const callId = hooks?.callId ?? randomUUID();
    const emit = (evt: AgentStreamEvent) => hooks?.emit?.(evt);
    const step = async <T>(tool: string, fn: () => Promise<T>, note?: (r: T) => string): Promise<T> => {
      emit({ type: "tool_call", callId, node: "suno", tool, op: "start", level: "info" });
      const t0 = Date.now();
      try {
        const r = await fn();
        emit({ type: "tool_call", callId, node: "suno", tool, op: "end", level: "info", ms: Date.now() - t0, message: note ? note(r) : undefined });
        return r;
      } catch (e) {
        emit({ type: "tool_call", callId, node: "suno", tool, op: "end", level: "error", ms: Date.now() - t0, message: e instanceof Error ? e.message.slice(0, 160) : String(e) });
        throw e;
      }
    };

    const api = await sunoApi(cookie, {
      transport: this.transport(),
      waitAudioMs: this.opts.waitAudioMs,
      fingerprint: this.opts.fingerprint,
      userAgent: this.opts.userAgent,
    });
    // ⑱ 闸门预检+人工等待编排（R1 UX 2026-09-01）：required 不再 fail-fast 终结 job，
    // 挂起轮询 c/check 直到用户在浏览器过一次验证（自动续跑）；TTL 超时抛 CaptchaTimeoutError
    // → cookie 轮换；池耗尽 → 失败编排（state_saved 缓存 + 一次性 LLM 终报 + failed(captcha)）
    const gate = await step("captchaGate", () => api.captchaGate(), (g) => (g.required ? `需验证（转人工等待）captcha_version=${g.version ?? "?"}` : "放行"));
    if (gate.required) await this.gateWait(api, callId, hooks, gate);
    // 配额预检（get_limit 等价：/api/billing/info/）
    await step("quotaCheck", async () => {
      const c = (await api.get_credits()) as { credits_left: number };
      if (c.credits_left <= 0) throw new SunoQuotaError(`配额耗尽（剩余 ${c.credits_left}）`);
      return c;
    }, (c) => `剩余 credits：${c.credits_left}`);

    // custom_generate（计划驱动：lyrics 全文 + 风格/调性/节奏型 tags）
    const tags = [req.arrangement.groove, `${req.arrangement.key}调`, ...req.arrangement.chordProgression].join("、");
    const prompt =
      req.lyrics.join("\n") +
      `\n\n[创作约束] 调性=${req.arrangement.key}，速度=${req.arrangement.bpm}bpm，节奏型=${req.arrangement.groove}，目标时长≈${req.durationSec}s`;
    // vendor onPoll（二次开发点⑮）→ suno_progress 帧：生成轮询实时回对话
    const gen = () =>
      api.custom_generate(prompt, tags, req.title, false, DEFAULT_MODEL, true, undefined, (infos, elapsedMs) => {
        const done = infos.filter((a) => a.status === "complete" || a.status === "error").length;
        emit({
          type: "suno_progress", callId, stage: "poll", done, total: infos.length,
          status: infos.every((a) => a.status === "complete") ? "complete"
            : infos.some((a) => a.status === "error") ? "error" : "streaming",
          elapsedMs,
          note: infos.map((a) => `${a.id.slice(0, 8)}:${a.status}`).join(" "),
        });
      });
    const genNote = (r: Awaited<ReturnType<typeof gen>>) => `clips: ${r.map((a) => a.id.slice(0, 8)).join(",")}`;
    let songs: Awaited<ReturnType<typeof gen>>;
    try {
      songs = await step("customGenerate", gen, genNote);
    } catch (e) {
      // 生成中途触发验证码（token 被撤，上游 getCaptcha fail-fast）→ 转一次人工等待，放行后重投
      if (!(e instanceof CaptchaRequiredError) || e instanceof CaptchaTimeoutError) throw e;
      const g2 = await step("captchaGate", () => api.captchaGate(), () => "生成中途再触发验证");
      if (g2.required) await this.gateWait(api, callId, hooks, g2);
      songs = await step("customGenerate", gen, genNote);
    }
    const [primary] = songs;
    if (!primary) throw new Error("Suno 未返回作品");

    // 兜底轮询（wait_audio 内部已轮询到 waitAudioMs；feed 仅确认状态）
    const final = await step("feedConfirm", async () =>
      (await api.get([primary.id])).find((a) => a.status === "complete"));
    if (!final) throw new Error("音频未就绪（轮询超时）");

    // 二次开发点⑪: feed 不含 media_urls（audio_url 恒为 forbidden 占位）——经 /api/clip/{id} 详情取真实音频源
    const detail = await step("clipDetail", () => api.getClip(final.id) as Promise<Record<string, unknown>>);
    // 二次开发点⑭: 下载密文 → DRM 解密（rights GCM unwrap + AES-CTR，逆向自 suno web）→ 明文同源保存 → 本地播放
    const sources = this.resolveSources(detail);
    if (sources.length === 0) throw new Error("音频源缺失（详情接口 media_urls 未就绪）");
    const encrypted = await step("download", async () => {
      const res = await this.transport().get(sources[0]!, { responseType: "arraybuffer", timeout: 60_000 });
      return new Uint8Array(res.data as ArrayBuffer);
    }, (b) => `${b.byteLength} bytes（加密源）`);
    const decrypted = await step("decrypt", () => decryptClipAudio(api, final.id, encrypted), (b) => `${b.byteLength} bytes（明文 m4a）`);
    const ext = "m4a";
    const fileName = `suno_${req.title.slice(0, 40).replace(/[^\w一-鿿-]+/g, "_")}_${req.seed}.${ext}`;
    await step("saveFile", async () => {
      if (!existsSync(this.opts.publicDir)) await mkdir(this.opts.publicDir, { recursive: true });
      await writeFile(join(this.opts.publicDir, fileName), decrypted);
    }, () => `/generated/${fileName}`);
    return {
      audioUrl: `/generated/${fileName}`,
      sourceFormat: ext as "mp3" | "wav" | "flac" | "m4a",
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
