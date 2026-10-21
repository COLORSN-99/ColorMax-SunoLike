import { NextRequest, NextResponse } from "next/server";
import { jobStore, routeAfterFailure } from "@colormax/agents";
import { readSettings } from "@colormax/llm";
import { ClassifyIntentRequestSchema, ClassifyIntentResponseSchema, validateRequest } from "@/lib/api-schemas";

/**
 * POST /api/jobs/:id/intent { message } — 失败后新消息意图三分类（Stage 6.2）
 * resume：接续同一任务｜restart：同曲重开（丢弃快照，前端以原 prompt 重发）｜new：无关新任务
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = (await req.json().catch(() => ({}))) as { message?: string };
  
  // Validate request body
  const validation = validateRequest(ClassifyIntentRequestSchema, rawBody);
  if (!validation.success) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }
  
  const info = jobStore.resumeInfo(id);
  if (!info) return NextResponse.json({ action: "new" });
  
  const action = await routeAfterFailure(readSettings(), { phase: info.failPhase, error: info.error }, validation.data.message);
  const response = { action, failPhase: info.failPhase, origPrompt: info.prompt };
  
  // Validate response (only the action field is required by ClassifyIntentResponse)
  const responseValidated = ClassifyIntentResponseSchema.parse({ action });
  return NextResponse.json({ ...responseValidated, failPhase: info.failPhase, origPrompt: info.prompt });
}
