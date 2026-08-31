import { NextRequest, NextResponse } from "next/server";
import { readSettings } from "@colormax/llm";
import { jobStore } from "@colormax/agents";
import { MockAdapter, SunoAdapter } from "@colormax/engine";
import { join } from "node:path";
import { sunoEnv } from "@/lib/env";

/**
 * 引擎选择（Stage 3 新模式：vendor 本地二次开发）：
 * 配置 SUNO_COOKIES（会话池，多 cookie 以 || 分隔）→ 真实 Suno 引擎（验收/演示链路）；
 * 未配置 → Mock 引擎（开发期调试），响应中提示。指纹档见 lib/env（⑯）。
 */
function resolveEngine() {
  const { cookies, fingerprint, userAgent } = sunoEnv();
  if (cookies.length === 0) {
    return { engine: new MockAdapter(join(process.cwd(), "public/generated")), mode: "mock" as const };
  }
  return {
    engine: new SunoAdapter({ cookies, publicDir: join(process.cwd(), "public/generated"), fingerprint, userAgent }),
    mode: "suno" as const,
  };
}

/** POST /api/jobs — 发起创作任务（LangGraph 编排；事件经 /events 流转） */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt?: string; sessionId?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const { engine, mode } = resolveEngine();
  const job = jobStore.create(body.sessionId ?? "studio");
  void jobStore.run(job.id, {
    prompt,
    settings: readSettings(),
    engine,
    maxRetries: 3,
  });
  return NextResponse.json({ id: job.id, engineMode: mode, engineModeDoc: mode === "mock" ? "未配置 SUNO_COOKIES——开发期 Mock 引擎；验收/演示请配置 Suno 会话池" : "Suno 真实链路" });
}
