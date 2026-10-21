"use client";

/**
 * SSE 事件流连接管理 hook
 * 职责：从 /api/jobs/:id/events 消费 SSE 流，应用事件到 segments，节流落盘
 * 现通过 IPersistence 抽象层访问 localStorage
 */
import { useCallback, useState } from "react";
import type { Msg, Segment, Evt } from "@/lib/segments";
import { applyEvent } from "@/lib/segments";
import { parseSseBuffer } from "@/lib/sse";
import { saveMsgs as storageSaveMsgs } from "@/lib/storage";

const uid = () => Math.random().toString(36).slice(2, 10);

export function useSSEConnection() {
  const [phase, setPhase] = useState<string | null>(null);

  const upsertAssistant = useCallback((list: Msg[], jobId: string, segs: Segment[], lastSeq?: number): Msg[] => {
    const i = list.findIndex((m) => m.jobId === jobId);
    if (i < 0) return [...list, { id: uid(), role: "assistant", jobId, segments: segs, lastSeq }];
    return list.map((m, j) => (j === i ? { ...m, segments: segs, lastSeq: lastSeq ?? m.lastSeq } : m));
  }, []);

  /**
   * 消费事件流（POST 与续播共用）
   * @param jobId - 任务 ID
   * @param startSeq - 起始序号（0=全量，>0=续播）
   * @param existing - 现有消息列表
   * @param targetActive - 当前激活会话 ID（用于落盘）
   * @param onMsgsUpdate - 消息更新回调
   */
  const consume = useCallback(
    async (
      jobId: string,
      startSeq: number,
      existing: Msg[],
      targetActive: string,
      onMsgsUpdate: (msgs: Msg[]) => void,
    ) => {
      const url = `/api/jobs/${jobId}/events${startSeq > 0 ? `?after=${startSeq}` : ""}`;
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`事件流失败 HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let cur = existing;
      let seen = startSeq;
      let sinceSave = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { frames, rest } = parseSseBuffer(buf);
        buf = rest;

        for (const f of frames) {
          let e: Evt & { seq?: number };
          try {
            e = JSON.parse(f.data);
          } catch {
            continue;
          }
          if (typeof e.seq === "number") {
            if (e.seq <= seen) continue;
            seen = e.seq;
            e.roundId = e.roundId ?? f.id;
          }
          if (f.event === "status") continue;
          if (f.event === "phase") setPhase(e.phase ?? null);
          if (f.event === "done") setPhase("deliver");
          e.jobId = jobId;

          cur = upsertAssistant(
            cur,
            jobId,
            applyEvent(cur.find((m) => m.jobId === jobId)?.segments ?? [], e),
            seen,
          );
          onMsgsUpdate(cur);

          // localStorage 节流：高频 thinking 帧下每 30 帧落盘一次（终态帧必落）
          sinceSave++;
          const terminal = f.event === "done" || f.event === "failed" || f.event === "error_review";
          if (terminal || sinceSave >= 30) {
            storageSaveMsgs(undefined, targetActive, cur);
            sinceSave = 0;
          }
        }
      }
      storageSaveMsgs(undefined, targetActive, cur);
    },
    [upsertAssistant],
  );

  return { phase, setPhase, consume, upsertAssistant };
}
