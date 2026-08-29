import { jobStore } from "@colormax/agents";

/** GET /api/jobs/:id/events — SSE 阶段事件流（phase payload / done / failed） */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = jobStore.get(id);
  if (!job) return new Response("not found", { status: 404 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      // 初始：任务现状重放（防订阅竞态）
      send("status", job);
      const unsub = jobStore.subscribe(id, (e) => {
        if (e.type === "phase") {
          send("phase", { phase: e.phase, payload: e.payload });
        } else if (e.type === "done") {
          send("done", { result: e.result, report: e.report });
          controller.close();
        } else if (e.type === "failed") {
          send("failed", { error: e.error });
          controller.close();
        }
      });
      const t = setTimeout(() => {
        // 防止低活跃路由长时间保留（客户端断开兜底）
      }, 5 * 60_000);
      _req.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        unsub();
        controller.close();
      });
    },
    cancel() {
      // 客户端断开：由 abort 信号处理
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
