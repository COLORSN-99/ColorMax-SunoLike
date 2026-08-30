import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/** LLM 设置（OpenAI 兼容端点，全链路真实调用——无 mock 分支） */
export interface LlmSettings {
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  /** 各角色温度/模型可覆盖（空=用全局） */
  role?: Record<"intent" | "plan" | "judge", { model?: string; temperature?: number } | undefined>;
}

export const DEFAULT_SETTINGS: LlmSettings = {
  baseURL: "http://localhost:11434/v1",
  apiKey: "",
  model: "qwen2.5",
  temperature: 0.8,
};

export const SETTINGS_FILE = ".env.local";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_0-9]+)=(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export function readSettings(envPath = SETTINGS_FILE): LlmSettings {
  const env = parseEnvFile(envPath);
  return {
    baseURL: env.LLM_BASE_URL || DEFAULT_SETTINGS.baseURL,
    apiKey: env.LLM_API_KEY || "",
    model: env.LLM_MODEL || DEFAULT_SETTINGS.model,
    temperature: Number(env.LLM_TEMPERATURE ?? DEFAULT_SETTINGS.temperature),
  };
}

/** 设置写入 .env.local（增量合并：只更新 LLM_* 键，保留其他行（如 SUNO_COOKIES）——防覆盖用户配置） */
export function writeSettings(settings: LlmSettings, envPath = SETTINGS_FILE): void {
  const updates: Record<string, string> = {
    LLM_BASE_URL: settings.baseURL,
    LLM_API_KEY: settings.apiKey,
    LLM_MODEL: settings.model,
    LLM_TEMPERATURE: String(settings.temperature),
  };
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8").split("\n") : [];
  const seen = new Set<string>();
  const out = existing.map((line) => {
    const m = line.match(/^\s*([A-Z_0-9]+)=/);
    if (m && updates[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${updates[m[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  writeFileSync(envPath, out.join("\n"), "utf-8");
}

/** 校验设置可用性（非空+可解析） */
export function validateSettings(s: LlmSettings): string | null {
  if (!s.baseURL.startsWith("http")) return "baseURL 必须为 http(s) 地址";
  if (!s.model.trim()) return "model 必填";
  if (Number.isNaN(s.temperature) || s.temperature < 0 || s.temperature > 2)
    return "temperature 需在 0-2 之间";
  return null;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  text: string;
  raw: unknown;
}

/**
 * OpenAI 兼容 chat 调用（fetch 实现，零 SDK 依赖；S1-T1/T2）
 * 失败重试 2 次（指数退避 1s/2s），最后失败抛错。
 */
export async function chatCompletion(
  settings: LlmSettings,
  messages: ChatMessage[],
  opts: { temperature?: number; model?: string; signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const url = `${settings.baseURL.replace(/\/+$/, "")}/chat/completions`;
  const body = {
    model: opts.model ?? settings.model,
    temperature: opts.temperature ?? settings.temperature,
    messages,
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= 2; attempt++) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1), opts.signal);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("LLM 空响应");
      return { text, raw: json };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr));
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

/** 从对话内容中提取 JSON（容忍 ```json 围栏与前后噪音） */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("响应中未找到 JSON");
  return JSON.parse(raw.slice(start, end + 1)) as T;
}

export const stableInt = (s: string, max: number): number => {
  const h = createHash("sha256").update(s).digest();
  return h.readUInt32BE(0) % max;
};
