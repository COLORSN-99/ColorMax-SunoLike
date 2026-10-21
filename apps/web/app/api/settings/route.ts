import { NextRequest, NextResponse } from "next/server";
import {
  parseRegistry, toSettingsView, updateRegistry, validateSettings, writeRegistry,
  type ApiFormat, type ProviderProfile,
} from "@colormax/llm";
import { parseEnvFile } from "@colormax/config/env-loader";
import { UpdateSettingsRequestSchema, validateRequest } from "@/lib/api-schemas";
import { logger, ValidationError } from "@colormax/logger";

const SETTINGS_FILE = ".env.local";

/** GET：安全 DTO（永不将 raw API Key 送进浏览器） */
export async function GET() {
  const env = parseEnvFile(SETTINGS_FILE);
  return NextResponse.json(toSettingsView(parseRegistry(env)));
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
  let rawBody: SaveBody;
  try { rawBody = await req.json() as SaveBody; }
  catch { 
    logger.warn("Settings POST: Invalid JSON body");
    return NextResponse.json({ error: "请求必须是 JSON" }, { status: 400 }); 
  }
  
  // Zod validation for API contract
  const validation = validateRequest(UpdateSettingsRequestSchema, rawBody);
  if (!validation.success) {
    logger.warn({ error: validation.error }, "Settings validation failed");
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  const body = rawBody;  // Type narrowing after validation
  
  const required = [body.profileId, body.providerId, body.provider, body.baseURL, body.model];
  if (required.some((x) => typeof x !== "string" || !x.trim())) {
    const error = new ValidationError("profileId/providerId/provider/baseURL/model 必填");
    logger.warn({ missingFields: required }, "Missing required settings fields");
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const candidate: { provider: string; baseURL: string; apiKey: string; model: string; apiFormat: ApiFormat; temperature: number; maxTokens: number; thinking: boolean } = {
    provider: body.provider!, baseURL: body.baseURL!, apiKey: body.apiKey ?? "",
    model: body.model!, apiFormat: body.apiFormat === "anthropic" ? "anthropic" : "openai",
    temperature: Number(body.temperature ?? 0.8), maxTokens: Number(body.maxTokens ?? 4096), thinking: Boolean(body.thinking),
  };
  const err = validateSettings(candidate);
  if (err) {
    logger.warn({ error: err }, "Settings validation error");
    const error = new ValidationError(err);
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  try {
    const env = parseEnvFile(SETTINGS_FILE);
    const registry = updateRegistry(parseRegistry(env), {
      ...(candidate as Omit<ProviderProfile, "profileId" | "providerId">),
      profileId: body.profileId!, providerId: body.providerId!,
      ...(body.apiKey === undefined ? {} : { apiKey: body.apiKey }),
      clearApiKey: body.clearApiKey === true,
    });
    writeRegistry(registry, SETTINGS_FILE);
    logger.info({ profileId: body.profileId, providerId: body.providerId }, "Settings saved successfully");
    return NextResponse.json({ ok: true, settings: toSettingsView(registry) });
  } catch (e) {
    logger.error({ error: e instanceof Error ? e.message : String(e) }, "Failed to save settings");
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存失败" }, { status: 400 });
  }
}
