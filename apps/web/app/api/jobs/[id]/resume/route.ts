import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@colormax/agents";
import { readSettings } from "@colormax/llm";
import { createEngine } from "@/lib/engine-factory";

/**
 * 接续失败任务（POST /api/jobs/:id/resume）
 * 从失败快照重跑（跳过已完成节点，仅重跑失败点及之后）
 * 引擎实例需重建（避免状态污染）
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!jobStore.canResume(id)) {
    return NextResponse.json({ error: "无失败快照可接续（进程可能已重启）" }, { status: 409 });
  }
  const job = jobStore.get(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  
  // 后台接续（fire-and-forget，事件经 /events 流转；不 await 以免阻塞响应/引擎实例被 GC）
  const { engine } = createEngine();
  void jobStore.resume(id, { engine, settings: readSettings() });
  return NextResponse.json({ ok: true, fromPhase: "resume" });
}

/** DELETE /api/jobs/:id/resume — 放弃接续（switch/cancel：清除失败快照） */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  jobStore.dropResume(id);
  return NextResponse.json({ ok: true });
}
