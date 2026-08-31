import { NextRequest, NextResponse } from "next/server";
import { jobStore } from "@colormax/agents";
import { readSettings } from "@colormax/llm";
import { MockAdapter, SunoAdapter } from "@colormax/engine";
import { join } from "node:path";
import { sunoEnv } from "@/lib/env";

/** 引擎重建（与 POST /api/jobs 同策略）：接续需要新的 engine 实例 */
function resolveEngine() {
  const { cookies, fingerprint, userAgent } = sunoEnv();
  if (cookies.length === 0) return new MockAdapter(join(process.cwd(), "public/generated"));
  return new SunoAdapter({ cookies, publicDir: join(process.cwd(), "public/generated"), fingerprint, userAgent });
}

/** POST /api/jobs/:id/resume — 从失败快照接续（跳过已完成节点，仅重跑失败点及之后；同进程内存） */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!jobStore.canResume(id)) return NextResponse.json({ error: "无失败快照可接续（进程可能已重启）" }, { status: 409 });
  const job = jobStore.get(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  // 后台接续（fire-and-forget，事件经 /events 流转；不 await 以免阻塞响应/引擎实例被 GC）
  void jobStore.resume(id, { engine: resolveEngine(), settings: readSettings() });
  return NextResponse.json({ ok: true, fromPhase: "resume" });
}

/** DELETE /api/jobs/:id/resume — 放弃接续（switch/cancel：清除失败快照） */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  jobStore.dropResume(id);
  return NextResponse.json({ ok: true });
}
