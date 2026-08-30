import { NextRequest, NextResponse } from "next/server";
import {
  readSettings,
  writeSettings,
  validateSettings,
  type LlmSettings,
} from "@colormax/llm";

/** GET：返回当前 LLM 设置（本地开发工具，展示给面板） */
export async function GET() {
  return NextResponse.json(readSettings());
}

/** POST：校验并写入 .env.local（增量合并，保留 SUNO_COOKIES 等用户键） */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<LlmSettings>;
  const next: LlmSettings = {
    provider: body.provider ?? "",
    baseURL: body.baseURL ?? "",
    apiKey: body.apiKey ?? "",
    model: body.model ?? "",
    apiFormat: body.apiFormat === "anthropic" ? "anthropic" : "openai",
    temperature: Number(body.temperature ?? 0.8),
    maxTokens: Number(body.maxTokens ?? 4096),
    thinking: Boolean(body.thinking),
  };
  const err = validateSettings(next);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  writeSettings(next);
  return NextResponse.json({ ok: true, settings: readSettings() });
}
