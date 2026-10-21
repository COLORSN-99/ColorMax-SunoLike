"use client";

/**
 * 会话恢复 hook
 * 职责：刷新时探测未完成任务，决策续播/重放/标记丢失
 */
import { useCallback } from "react";
import type { Msg, Segment } from "@/lib/segments";
import { loadMsgs, planRestore, type KV } from "@/lib/storage";

/** 探测服务端 job 现状（304→gone / running / terminal） */
async function probeJob(id: string): Promise<"terminal" | "running" | "gone"> {
  try {
    const r = await fetch(`/api/jobs/${id}`);
    if (!r.ok) return "gone";
    const j = (await r.json()) as { status: string };
    return j.status === "running" || j.status === "queued" || j.status === "pending" ? "running" : "terminal";
  } catch {
    return "gone";
  }
}

export function useRestore() {
  /**
   * 刷新恢复：对当前会话未终结的 assistant 消息探测服务端 → 续播/重放/标记丢失
   * @param kv - localStorage 抽象
   * @param active - 当前激活会话 ID
   * @param upsertAssistant - 更新 assistant 消息的函数
   * @param consume - 消费事件流的函数
   * @param setMsgs - 更新消息列表的函数
   * @param saveMsgs - 持久化消息函数
   */
  const resumePending = useCallback(
    async (
      kv: KV | null,
      active: string,
      upsertAssistant: (list: Msg[], jobId: string, segs: Segment[], lastSeq?: number) => Msg[],
      consume: (jobId: string, startSeq: number, existing: Msg[], targetActive: string) => Promise<void>,
      setMsgs: (msgs: Msg[]) => void,
      saveMsgs: (kv: KV, sessionId: string, msgs: Msg[]) => void,
    ) => {
      if (!kv || !active) return;
      const loaded = loadMsgs(kv, active);
      const actions = await planRestore(loaded, probeJob);
      let cur = loaded;

      for (const a of actions) {
        const msg = loaded[a.msgIndex];
        if (a.type === "lost") {
          if (msg.segments.some((s) => s.kind === "text" && s.text.includes("状态已丢失"))) continue; // 去重
          cur = upsertAssistant(cur, msg.jobId!, [
            ...msg.segments,
            { kind: "text", text: "⚠ 该任务的服务端状态已丢失（进程重启——接续快照仅存活于同进程）。请重新发起创作。" },
          ], msg.lastSeq);
        } else if (a.type === "replay" || a.type === "watch") {
          // replay：after=0 全量补帧；watch：after=已见游标续播
          const start = a.type === "replay" ? 0 : a.fromSeq;
          try {
            await consume(a.jobId, start, cur, active);
            cur = cur.map((m) => (m.jobId === a.jobId ? m : m));
          } catch {
            /* 续播失败保持原样 */
          }
        }
      }
      setMsgs(cur);
      if (kv && active) saveMsgs(kv, active, cur);
    },
    [],
  );

  return { resumePending };
}
