import { NextRequest, NextResponse } from "next/server";
import {
  parseRegistry, toSettingsView, updateRegistry, validateSettings, writeRegistry,
  type ApiFormat, type ProviderProfile,
} from "@colormax/llm";
import { readFileSync, existsSync } from "node:fs";

const SETTINGS_FILE = ".env.local";
function env() {
  if (!existsSync(SETTINGS_FILE)) return {} as Record<string, string>;
  return Object.fromEntries(readFileSync(SETTINGS_FILE, "utf-8").split("\n").flatMap((line) => {
    const m = line.match(/^\s*([A-Z_0-9]+)=(.*)\s*$/);
    return m ? [[m[1], m[2].replace(/^["']|["']$/g, "")]] : [];
  }));
}

/** GET：安全 DTO（永不将 raw API Key 送进浏览器） */
export async function GET() {
  return NextResponse.json(toSettingsView(parseRegistry(env())));
}

interface SaveBody {
  profileId?: string;
  providerId?: string;
  provider?: string;
  baseURL?: string;
  apiKey?: string; // omit=保留；非空=替换；空+clearApiKey=true=清除
  clearApiKey?: boolean;
  model?: string;
  apiFormat?: ApiFormat;
  temperature?: number;
  maxTokens?: number;
  thinking?: boolean;
}

/** POST：保存并激活一个 profile；成功响应同样只含脱敏 DTO。 */
export async function POST(req: NextRequest) {
  let body: SaveBody;
  try { body = await req.json() as SaveBody; }
  catch { return NextResponse.json({ error: "请求必须是 JSON" }, { status: 400 }); }
  const required = [body.profileId, body.providerId, body.provider, body.baseURL, body.model];
  if (required.some((x) => typeof x !== "string" || !x.trim()))
    return NextResponse.json({ error: "profileId/providerId/provider/baseURL/model 必填" }, { status: 400 });
  const candidate: { provider: string; baseURL: string; apiKey: string; model: string; apiFormat: ApiFormat; temperature: number; maxTokens: number; thinking: boolean } = {
    provider: body.provider!, baseURL: body.baseURL!, apiKey: body.apiKey ?? "",
    model: body.model!, apiFormat: body.apiFormat === "anthropic" ? "anthropic" : "openai",
    temperature: Number(body.temperature ?? 0.8), maxTokens: Number(body.maxTokens ?? 4096), thinking: Boolean(body.thinking),
  };
  const err = validateSettings(candidate);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  try {
    const registry = updateRegistry(parseRegistry(env()), {
      ...(candidate as Omit<ProviderProfile, "profileId" | "providerId">),
      profileId: body.profileId!, providerId: body.providerId!,
      ...(body.apiKey === undefined ? {} : { apiKey: body.apiKey }),
      clearApiKey: body.clearApiKey === true,
    });
    writeRegistry(registry, SETTINGS_FILE);
    return NextResponse.json({ ok: true, settings: toSettingsView(registry) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 });
  }
}
