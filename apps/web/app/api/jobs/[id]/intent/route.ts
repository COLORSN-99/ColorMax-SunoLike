import { NextRequest, NextResponse } from "next/server";
import { jobStore, routeAfterFailure } from "@colormax/agents";
import { readSettings } from "@colormax/llm";

/**
 * POST /api/jobs/:id/intent { message } — 失败后新消息意图三分类（Stage 6.2）
 * resume：接续同一任务｜restart：同曲重开（丢弃快照，前端以原 prompt 重发）｜new：无关新任务
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const info = jobStore.resumeInfo(id);
  if (!info || !body.message) return NextResponse.json({ action: "new" });
  const action = await routeAfterFailure(readSettings(), { phase: info.failPhase, error: info.error }, body.message);
  return NextResponse.json({ action, failPhase: info.failPhase, origPrompt: info.prompt });
}
