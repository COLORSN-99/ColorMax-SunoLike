import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { ApiFormat, LlmSettings } from "./index.ts";
import { PROVIDER_BY_ID } from "./providers.ts";

export const PROFILES_ENV_KEY = "LLM_PROFILES_JSON";
const PROFILE_VERSION = 1;

export interface ProviderProfile extends LlmSettings {
  profileId: string;
  providerId: string;
}

export interface ProfileRegistry {
  version: number;
  activeId: string;
  profiles: Record<string, ProviderProfile>;
}

export type ProfileView = Omit<ProviderProfile, "apiKey"> & {
  hasApiKey: boolean;
  apiKeyMasked?: string;
};

export interface SettingsView {
  activeProfileId: string;
  profiles: ProfileView[];
  active: ProfileView;
}

/** 保留 path、去掉末尾 /；同一自定义端点稳定命中同一 key 桶。 */
export function normalizeBaseURL(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
}

export function profileIdFor(providerId: string, baseURL: string): string {
  return providerId === "custom" ? `custom:${normalizeBaseURL(baseURL)}` : providerId;
}

export function maskApiKey(key: string): string | undefined {
  if (!key) return undefined;
  if (key.length <= 4) return "•".repeat(key.length);
  const head = Math.min(3, key.length - 4);
  return `${key.slice(0, head)}…${key.slice(-4)}`;
}

export function toProfileView(p: ProviderProfile): ProfileView {
  const { apiKey: _apiKey, ...rest } = p;
  return { ...rest, hasApiKey: Boolean(_apiKey), apiKeyMasked: maskApiKey(_apiKey) };
}

export function toSettingsView(registry: ProfileRegistry): SettingsView {
  const active = registry.profiles[registry.activeId] ?? Object.values(registry.profiles)[0];
  if (!active) throw new Error("LLM profile registry has no active profile");
  return { activeProfileId: active.profileId, active: toProfileView(active), profiles: Object.values(registry.profiles).map(toProfileView) };
}

function assertEnvSafe(value: string, field: string): void {
  if (/\r|\n/.test(value)) throw new Error(`${field} 不能包含换行符`);
}

function envProfile(raw: Record<string, string>): ProviderProfile {
  const provider = raw.LLM_PROVIDER || "DeepSeek";
  const baseURL = raw.LLM_BASE_URL || "https://api.deepseek.com";
  const providerId = ["deepseek", "qwen", "zhipu", "kimi", "siliconflow", "openai", "xai", "ollama"]
    .find((id) => PROVIDER_BY_ID(id)?.openaiBase === baseURL || PROVIDER_BY_ID(id)?.anthropicBase === baseURL) ?? "custom";
  const profileId = profileIdFor(providerId, baseURL);
  return {
    profileId, providerId, provider, baseURL,
    apiKey: raw.LLM_API_KEY || "", model: raw.LLM_MODEL || "deepseek-v4-flash",
    apiFormat: raw.LLM_API_FORMAT === "anthropic" ? "anthropic" : "openai",
    temperature: Number(raw.LLM_TEMPERATURE ?? 0.8), maxTokens: Number(raw.LLM_MAX_TOKENS ?? 4096), thinking: raw.LLM_THINKING === "1",
  };
}

export function parseRegistry(raw: Record<string, string>): ProfileRegistry {
  const source = raw[PROFILES_ENV_KEY];
  if (source) {
    try {
      const parsed = JSON.parse(source) as ProfileRegistry;
      if (parsed?.version === PROFILE_VERSION && parsed.activeId && parsed.profiles?.[parsed.activeId]) return parsed;
    } catch { /* legacy/malformed => derive migration profile below */ }
  }
  const legacy = envProfile(raw);
  return { version: PROFILE_VERSION, activeId: legacy.profileId, profiles: { [legacy.profileId]: legacy } };
}

export function serializeRegistry(registry: ProfileRegistry): string {
  const data = JSON.stringify(registry);
  assertEnvSafe(data, PROFILES_ENV_KEY);
  return data;
}

export function registrySettings(registry: ProfileRegistry): LlmSettings {
  const p = registry.profiles[registry.activeId];
  if (!p) throw new Error("LLM profile registry active profile missing");
  const { profileId: _profileId, providerId: _providerId, ...settings } = p;
  return settings;
}

export function updateRegistry(
  registry: ProfileRegistry,
  input: Omit<ProviderProfile, "apiKey"> & { apiKey?: string; clearApiKey?: boolean },
): ProfileRegistry {
  const profileId = input.profileId || profileIdFor(input.providerId, input.baseURL);
  const previous = registry.profiles[profileId];
  const apiKey = input.clearApiKey ? "" : input.apiKey === undefined ? (previous?.apiKey ?? "") : input.apiKey;
  for (const [name, value] of Object.entries({ provider: input.provider, baseURL: input.baseURL, model: input.model, apiKey })) assertEnvSafe(String(value), name);
  const { clearApiKey: _clearApiKey, ...fields } = input;
  const profile: ProviderProfile = { ...fields, profileId, apiKey };
  return { ...registry, activeId: profileId, profiles: { ...registry.profiles, [profileId]: profile } };
}

/** 原子替换 .env.local 中 LLM profile registry + active profile 镜像，保留 SUNO_COOKIES 等其他键。 */
export function writeRegistry(registry: ProfileRegistry, envPath: string): void {
  const active = registrySettings(registry);
  const updates: Record<string, string> = {
    LLM_PROVIDER: active.provider, LLM_BASE_URL: active.baseURL, LLM_API_KEY: active.apiKey,
    LLM_MODEL: active.model, LLM_API_FORMAT: active.apiFormat, LLM_TEMPERATURE: String(active.temperature),
    LLM_MAX_TOKENS: String(active.maxTokens), LLM_THINKING: active.thinking ? "1" : "0",
    [PROFILES_ENV_KEY]: serializeRegistry(registry),
  };
  for (const [key, value] of Object.entries(updates)) assertEnvSafe(value, key);
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf-8").split("\n") : [];
  const seen = new Set<string>();
  const out = existing.map((line) => {
    const key = line.match(/^\s*([A-Z_0-9]+)=/)?.[1];
    if (key && key in updates) { seen.add(key); return `${key}=${updates[key]}`; }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) out.push(`${key}=${value}`);
  const temp = `${dirname(envPath)}/.${basename(envPath)}.${randomUUID()}.tmp`;
  writeFileSync(temp, out.join("\n"), { encoding: "utf-8", mode: 0o600 });
  renameSync(temp, envPath);
}
