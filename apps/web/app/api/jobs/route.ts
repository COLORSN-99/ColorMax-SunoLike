import { NextRequest, NextResponse } from "next/server";
import { readSettings } from "@colormax/llm";
import { jobStore } from "@colormax/agents";
import { createEngine } from "@/lib/engine-factory";
import { CreateJobRequestSchema, type CreateJobResponse } from "@/lib/api-schemas";
import { validateRequest } from "@/lib/api-schemas";

/**
 * POST /api/jobs — 发起创作任务
 * LangGraph 编排：intent → plan → dispatch → suno → align → judge → deliver
 * 事件经 /events 流转（SSE）；引擎选择见 lib/engine-factory.ts
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const validation = validateRequest(CreateJobRequestSchema, body);
  
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { prompt, sessionId } = validation.data;
  const { engine, mode, modeDoc } = createEngine();
  const job = jobStore.create(sessionId ?? "studio");

  void jobStore.run(job.id, {
    prompt,
    settings: readSettings(),
    engine,
    maxRetries: 3,
  });

  const response: CreateJobResponse = {
    id: job.id,
    engineMode: mode,
    engineModeDoc: modeDoc,
  };

  return NextResponse.json(response);
}
