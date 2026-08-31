"use client";

/** R2 会话持久化 hook：sessions 列表 + 当前会话消息 + 刷新续播；纯浏览器 localStorage */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Msg, Segment, Evt } from "@/lib/segments";
import { applyEvent } from "@/lib/segments";
import {
  listSessions,
  saveSessions,
  loadMsgs,
  saveMsgs,
  newSession,
  planRestore,
  type SessionMeta,
  type KV,
} from "@/lib/storage";
import { parseSseBuffer } from "@/lib/sse";

const getKV = (): KV | null =>
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem: (k) => window.localStorage.getItem(k),
        setItem: (k, v) => window.localStorage.setItem(k, v),
        removeItem: (k) => window.localStorage.removeItem(k),
      }
    : null;

/** 探测服务端 job 现状（304→gone / running / terminal） */
async function probeJob(id: string): Promise<"terminal" | "running" | "gone"> {
  try {
    const r = await fetch(`/api/jobs/${id}`);
    if (!r.ok) return "gone";
    const j = (await r.json()) as { status: string };
    return j.status === "running" || j.status === "queued" ? "running" : "terminal";
  } catch {
    return "gone";
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function useSessions() {
  const kv = useRef<KV | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [active, setActive] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const restored = useRef(false);

  const upsertAssistant = useCallback((list: Msg[], jobId: string, segs: Segment[], lastSeq?: number): Msg[] => {
    const i = list.findIndex((m) => m.jobId === jobId);
    if (i < 0) return [...list, { id: uid(), role: "assistant", jobId, segments: segs, lastSeq }];
    return list.map((m, j) => (j === i ? { ...m, segments: segs, lastSeq: lastSeq ?? m.lastSeq } : m));
  }, []);

  // 初始化：载入 sessions，无则建一条
  useEffect(() => {
    kv.current = getKV();
    if (!kv.current) return;
    let list = listSessions(kv.current);
    if (list.length === 0) {
      const s = newSession("新对话");
      list = [s];
      saveSessions(kv.current, list);
    }
    setSessions(list);
    const first = list[0].id;
    setActive(first);
    setMsgs(loadMsgs(kv.current, first));
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSession = useCallback((id: string) => {
    setActive(id);
    setPhase(null);
    if (kv.current) setMsgs(loadMsgs(kv.current, id));
  }, []);

  const createSession = useCallback((title: string): string => {
    const s = newSession(title);
    const next = [s, ...listSessions(kv.current ?? ({} as KV))].slice(0, 20);
    if (kv.current) {
      saveSessions(kv.current, next);
      saveMsgs(kv.current, s.id, []);
    }
    setSessions(next);
    setActive(s.id);
    setMsgs([]);
    setPhase(null);
    return s.id;
  }, []);

  // 消费事件流（POST 与续播共用）：写回 msgs + 游标，done/failed 收敛
  const consume = useCallback(
    async (jobId: string, startSeq: number, existing: Msg[], targetActive: string) => {
      const url = `/api/jobs/${jobId}/events${startSeq > 0 ? `?after=${startSeq}` : ""}`;
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error(`事件流失败 HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let cur = existing;
      let seen = startSeq;
      let sinceSave = 0;
      const kvl = kv.current;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { frames, rest } = parseSseBuffer(buf);
        buf = rest;
        for (const f of frames) {
          let e: Evt & { seq?: number };
          try { e = JSON.parse(f.data); } catch { continue; }
          if (typeof e.seq === "number") {
            if (e.seq <= seen) continue;
            seen = e.seq;
            e.roundId = e.roundId ?? f.id;
          }
          if (f.event === "status") continue;
          if (f.event === "phase") setPhase(e.phase ?? null);
          if (f.event === "done") setPhase("deliver");
          e.jobId = jobId;
          cur = upsertAssistant(cur, jobId, applyEvent(
            cur.find((m) => m.jobId === jobId)?.segments ?? [],
            e,
          ), seen);
          setMsgs(cur);
          // localStorage 节流：高频 thinking 帧下每 30 帧落盘一次（终态帧必落）
          sinceSave++;
          const terminal = f.event === "done" || f.event === "failed" || f.event === "error_review";
          if (kvl && targetActive && (terminal || sinceSave >= 30)) {
            saveMsgs(kvl, targetActive, cur);
            sinceSave = 0;
          }
        }
      }
      if (kvl && targetActive) saveMsgs(kvl, targetActive, cur);
    },
    [upsertAssistant],
  );

  const run = useCallback(
    async (p: string) => {
      const trimmed = p.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      setPhase(null);
      // 会话标题（首条 prompt）
      let sid = active;
      let sList = sessions;
      const cur0 = msgs;
      const withUser = [...cur0, { id: uid(), role: "user" as const, segments: [{ kind: "text" as const, text: trimmed }] }];
      const activeMeta = sList.find((s) => s.id === sid);
      if (activeMeta && activeMeta.title === "新对话") {
        activeMeta.title = trimmed.slice(0, 40);
        activeMeta.updatedAt = Date.now();
        if (kv.current) saveSessions(kv.current, sList);
        setSessions([...sList]);
      }
      setMsgs(withUser);
      if (kv.current && sid) saveMsgs(kv.current, sid, withUser);
      try {
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
          kind: "error", roundId: uid(), headline: "任务启动失败", category: "unknown",
          steps: [], resolvableByCli: false, raw: msg, reviewStreaming: false, reviewText: "",
        };
        const cur = upsertAssistant(withUser, "boot-" + uid(), [errSeg]);
        setMsgs(cur);
        if (kv.current && sid) saveMsgs(kv.current, sid, cur);
      } finally {
        setBusy(false);
      }
    },
    [active, busy, consume, msgs, sessions, upsertAssistant],
  );

  // 刷新恢复：对当前会话未终结的 assistant 消息探测服务端 → 续播/重放/标记丢失
  const resumePending = useCallback(async () => {
    if (!kv.current || !active) return;
    const loaded = loadMsgs(kv.current, active);
    const actions = await planRestore(loaded, probeJob);
    let cur = loaded;
    for (const a of actions) {
      const msg = loaded[a.msgIndex];
      if (a.type === "lost") {
        if (msg.segments.some((s) => s.kind === "text" && s.text.includes("状态已丢失"))) continue; // 去重
        cur = upsertAssistant(cur, msg.jobId!, [
          ...msg.segments,
          { kind: "text", text: "⚠ 该任务的服务端状态已丢失（进程重启）。请重新发起，或等待接续能力（Stage 6.2）。" },
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
    if (kv.current && active) saveMsgs(kv.current, active, cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, consume, upsertAssistant]);

  return { sessions, active, msgs, phase, busy, engineNote, selectSession, createSession, run, resumePending, setPhase };
}
