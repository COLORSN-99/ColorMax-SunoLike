import { NextRequest, NextResponse } from "next/server";
import { readSettings } from "@colormax/llm";
import { jobStore } from "@colormax/agents";
import { createEngine } from "@/lib/engine-factory";

/**
 * 发起创作任务（POST /api/jobs）
 * LangGraph 编排：intent → plan → dispatch → suno → align → judge → deliver
 * 事件经 /events 流转（SSE）；引擎选择见 lib/engine-factory.ts
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt?: string; sessionId?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  
  const { engine, mode, modeDoc } = createEngine();
  const job = jobStore.create(body.sessionId ?? "studio");
  void jobStore.run(job.id, {
    prompt,
    settings: readSettings(),
    engine,
    maxRetries: 3,
  });
  return NextResponse.json({ id: job.id, engineMode: mode, engineModeDoc: modeDoc });
}
