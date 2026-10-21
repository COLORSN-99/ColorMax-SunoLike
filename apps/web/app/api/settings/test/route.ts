import { NextResponse } from "next/server";
import { readSettings, testConnection } from "@colormax/llm";
import { TestSettingsResponseSchema } from "@/lib/api-schemas";

/** POST /api/settings/test — 测试连接（最小请求验证 key/端点/API 格式） */
export async function POST() {
  const settings = readSettings();
  const result = await testConnection(settings);
  const validated = TestSettingsResponseSchema.parse(result);
  return NextResponse.json(validated);
}
