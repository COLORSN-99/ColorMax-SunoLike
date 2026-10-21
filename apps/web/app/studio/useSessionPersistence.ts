"use client";

/**
 * 会话持久化 hook
 * 职责：localStorage 读写（sessions 列表 + 消息），会话 CRUD
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Msg } from "@/lib/segments";
import {
  listSessions,
  saveSessions,
  loadMsgs,
  saveMsgs as storageSaveMsgs,
  newSession,
  type SessionMeta,
  type KV,
} from "@/lib/storage";

const getKV = (): KV | null =>
  typeof window !== "undefined" && window.localStorage
    ? {
        getItem: (k) => window.localStorage.getItem(k),
        setItem: (k, v) => window.localStorage.setItem(k, v),
        removeItem: (k) => window.localStorage.removeItem(k),
      }
    : null;

export function useSessionPersistence() {
  const kv = useRef<KV | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [active, setActive] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const restored = useRef(false);

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
    if (kv.current) setMsgs(loadMsgs(kv.current, id));
  }, []);

  const createSession = useCallback((title: string): string => {
    const s = newSession(title);
    const next = [s, ...listSessions(kv.current ?? ({} as KV))].slice(0, 20);
    if (kv.current) {
      saveSessions(kv.current, next);
      storageSaveMsgs(kv.current, s.id, []);
    }
    setSessions(next);
    setActive(s.id);
    setMsgs([]);
    return s.id;
  }, []);

  const saveMsgsToStorage = useCallback((sessionId: string, messages: Msg[]) => {
    if (kv.current) {
      storageSaveMsgs(kv.current, sessionId, messages);
    }
  }, []);

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    const sList = listSessions(kv.current ?? ({} as KV));
    const activeMeta = sList.find((s) => s.id === sessionId);
    if (activeMeta && activeMeta.title === "新对话") {
      activeMeta.title = title.slice(0, 40);
      activeMeta.updatedAt = Date.now();
      if (kv.current) saveSessions(kv.current, sList);
      setSessions([...sList]);
    }
  }, []);

  return {
    kv,
    sessions,
    active,
    msgs,
    setMsgs,
    restored,
    selectSession,
    createSession,
    saveMsgs: saveMsgsToStorage,
    updateSessionTitle,
  };
}
