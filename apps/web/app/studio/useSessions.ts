"use client";

/**
 * R2 会话持久化主 hook：组合 SSE 连接、持久化、恢复三个子 hook
 * 职责：对外暴露统一的会话管理 API
 */
import { useCallback, useState } from "react";
import type { Segment } from "@/lib/segments";
import { saveMsgs as storageSaveMsgs } from "@/lib/storage";
import { useSSEConnection } from "./useSSEConnection";
import { useSessionPersistence } from "./useSessionPersistence";
import { useRestore } from "./useRestore";

const uid = () => Math.random().toString(36).slice(2, 10);

export function useSessions() {
  const { phase, setPhase, consume: rawConsume, upsertAssistant } = useSSEConnection();
  const {
    kv,
    sessions,
    active,
    msgs,
    setMsgs,
    selectSession: rawSelectSession,
    createSession,
    saveMsgs,
    updateSessionTitle,
  } = useSessionPersistence();
  const { resumePending: rawResumePending } = useRestore();

  const [busy, setBusy] = useState(false);
  const [engineNote, setEngineNote] = useState<string | null>(null);

  // 包装 selectSession：同时重置 phase
  const selectSession = useCallback((id: string) => {
    setPhase(null);
    rawSelectSession(id);
  }, [rawSelectSession, setPhase]);

  // 包装 consume：注入 kv 和 setMsgs
  const consume = useCallback(
    async (jobId: string, startSeq: number, existing: typeof msgs, targetActive: string) => {
      await rawConsume(jobId, startSeq, existing, targetActive, kv.current, setMsgs, storageSaveMsgs);
    },
    [rawConsume, kv, setMsgs],
  );

  // 包装 resumePending：注入依赖
  const resumePending = useCallback(async () => {
    await rawResumePending(kv.current, active, upsertAssistant, consume, setMsgs, storageSaveMsgs);
  }, [rawResumePending, kv, active, upsertAssistant, consume, setMsgs]);

  const run = useCallback(
    async (p: string) => {
      const trimmed = p.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setPhase(null);

      // 会话标题（首条 prompt）
      const sid = active;
      const cur0 = msgs;
      const withUser = [
        ...cur0,
        { id: uid(), role: "user" as const, segments: [{ kind: "text" as const, text: trimmed }] },
      ];
      updateSessionTitle(sid, trimmed);
      setMsgs(withUser);
      if (kv.current && sid) storageSaveMsgs(kv.current, sid, withUser);

      try {
        // Stage 6.2：上一轮存在失败卡（error 段）→ 意图三分类（resume 接续 / restart 重开 / new 新任务）
        const lastFailed = [...withUser]
          .reverse()
          .find((m) => m.role === "assistant" && m.jobId && m.segments.some((s) => s.kind === "error"));

        if (lastFailed?.jobId) {
          try {
            const rt = await fetch(`/api/jobs/${lastFailed.jobId}/intent`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: trimmed }),
            });
            const { action } = (await rt.json().catch(() => ({ action: "new" }))) as { action?: string };
            if (action === "resume") {
              const rs = await fetch(`/api/jobs/${lastFailed.jobId}/resume`, { method: "POST" });
              if (rs.ok) {
                await consume(lastFailed.jobId, lastFailed.lastSeq ?? 0, withUser, sid);
                return;
              }
            } else if (action === "restart") {
              await fetch(`/api/jobs/${lastFailed.jobId}/resume`, { method: "DELETE" }); // 丢弃快照
            }
          } catch {
            /* 路由不可用 → 正常新任务 */
          }
        }

        const created = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed, sessionId: sid }),
        });
        if (!created.ok) throw new Error(`创建任务失败 HTTP ${created.status}`);
        const { id, engineModeDoc } = (await created.json()) as { id: string; engineModeDoc?: string };
        setEngineNote(engineModeDoc ?? null);
        await consume(id, 0, withUser, sid);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const errSeg: Segment = {
          kind: "error",
          roundId: uid(),
          headline: "任务启动失败",
          category: "unknown",
          steps: [],
          resolvableByCli: false,
          raw: msg,
          reviewStreaming: false,
          reviewText: "",
        };
        const cur = upsertAssistant(withUser, "boot-" + uid(), [errSeg]);
        setMsgs(cur);
        if (kv.current && sid) storageSaveMsgs(kv.current, sid, cur);
      } finally {
        setBusy(false);
      }
    },
    [active, busy, consume, msgs, updateSessionTitle, upsertAssistant, kv, setMsgs, setPhase],
  );

  return {
    sessions,
    active,
    msgs,
    phase,
    busy,
    engineNote,
    selectSession,
    createSession,
    run,
    resumePending,
    setPhase,
  };
}
