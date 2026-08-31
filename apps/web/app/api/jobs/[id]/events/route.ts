import { jobStore, type JobEvent } from "@colormax/agents";

/** 事件帧：id:seq 支持 Last-Event-ID 断线补帧；未知类型统一以 type 为事件名透传 */
function frame(e: JobEvent): string {
  const { type, ...body } = e;
  return `id: ${e.seq}\nevent: ${type}\ndata: ${JSON.stringify(body)}\n\n`;
}

/** GET /api/jobs/:id/events — SSE 事件流：先按游标补帧（Last-Event-ID / ?after=），再 live */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = jobStore.get(id);
  if (!job) return new Response("not found", { status: 404 });

  const url = new URL(req.url);
  const after = Number(req.headers.get("last-event-id") ?? url.searchParams.get("after") ?? "0") || 0;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      // 初始：任务现状重放（防订阅竞态）
      send(`event: status\ndata: ${JSON.stringify(job)}\n\n`);
      // 断线/刷新补帧（含已结束任务的历史——刷新续播底座）
      for (const e of jobStore.historyAfter(id, after)) send(frame(e));
      if (job.status === "done" || job.status === "failed") {
        controller.close();
        return;
      }
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const unsub = jobStore.subscribe(id, (e) => {
        if (e.seq <= after) return; // 补帧已覆盖
        send(frame(e));
        if (e.type === "done" || e.type === "failed") {
          unsub();
          close();
        }
      });
      req.signal?.addEventListener("abort", () => {
        unsub();
        close();
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
