import { NextRequest, NextResponse } from "next/server";
import { readSettings } from "@colormax/llm";
import { jobStore } from "@colormax/agents";
import { MockAdapter } from "@colormax/engine";

const engine = new MockAdapter();

/** POST /api/jobs — 发起创作任务（LangGraph 编排；返回 jobId，事件经 /events 流转） */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { prompt?: string; sessionId?: string };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const job = jobStore.create(body.sessionId ?? "studio");
  // 后台执行（不阻塞响应）
  void jobStore.run(job.id, {
    prompt,
    settings: readSettings(),
    engine,
    maxRetries: 3,
  });
  return NextResponse.json({ id: job.id });
}
