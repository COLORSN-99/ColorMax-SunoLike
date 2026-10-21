import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@colormax/agents";
import { readSettings } from "@colormax/llm";
import { createEngine } from "@/lib/engine-factory";
import { ResumeJobResponseSchema } from "@/lib/api-schemas";
import { logger, ConflictError, NotFoundError } from "@colormax/logger";

/**
 * POST /api/jobs/:id/resume — 从失败快照接续（跳过已完成节点，仅重跑失败点及之后；同进程内存）
 * 接续失败任务，从失败快照重跑
 * 引擎实例需重建（避免状态污染）
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!jobStore.canResume(id)) {
    logger.warn({ jobId: id }, "Cannot resume job - no snapshot or already complete");
    const error = new ConflictError("无失败快照可接续（进程可能已重启）");
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  const job = jobStore.get(id);
  if (!job) {
    logger.warn({ jobId: id }, "Job not found for resume");
    const error = new NotFoundError("Job", id);
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  // 后台接续（fire-and-forget，事件经 /events 流转；不 await 以免阻塞响应/引擎实例被 GC）
  const { engine } = createEngine();
  logger.info({ jobId: id }, "Resuming job from failure snapshot");
  void jobStore.resume(id, { engine, settings: readSettings() });
  const response = { ok: true, fromPhase: "resume" };
  const validated = ResumeJobResponseSchema.parse(response);
  return NextResponse.json(validated);
}

/** DELETE /api/jobs/:id/resume — 放弃接续（switch/cancel：清除失败快照） */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  jobStore.dropResume(id);
  return NextResponse.json({ ok: true });
}
