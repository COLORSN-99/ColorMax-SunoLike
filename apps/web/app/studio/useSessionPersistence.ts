"use client";

/**
 * 会话持久化 hook
 * 职责：localStorage 读写（sessions 列表 + 消息），会话 CRUD
 * 现通过 IPersistence 抽象层访问 localStorage
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
} from "@/lib/storage";

export function useSessionPersistence() {
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [active, setActive] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const restored = useRef(false);

  // 初始化：载入 sessions，无则建一条（storage.ts 自动使用 LocalStoragePersistence）
  useEffect(() => {
    if (typeof window === "undefined") return;
    let list = listSessions();
    if (list.length === 0) {
      const s = newSession("新对话");
      list = [s];
      saveSessions(undefined, list);
    }
    setSessions(list);
    const first = list[0].id;
    setActive(first);
    setMsgs(loadMsgs(undefined, first));
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectSession = useCallback((id: string) => {
    setActive(id);
    setMsgs(loadMsgs(undefined, id));
  }, []);

  const createSession = useCallback((title: string): string => {
    const s = newSession(title);
    const next = [s, ...listSessions()].slice(0, 20);
    saveSessions(undefined, next);
    storageSaveMsgs(undefined, s.id, []);
    setSessions(next);
    setActive(s.id);
    setMsgs([]);
    return s.id;
  }, []);

  const saveMsgsToStorage = useCallback((sessionId: string, messages: Msg[]) => {
    storageSaveMsgs(undefined, sessionId, messages);
  }, []);

  const updateSessionTitle = useCallback((sessionId: string, title: string) => {
    const sList = listSessions();
    const activeMeta = sList.find((s) => s.id === sessionId);
    if (activeMeta && activeMeta.title === "新对话") {
      activeMeta.title = title.slice(0, 40);
      activeMeta.updatedAt = Date.now();
      saveSessions(undefined, sList);
      setSessions([...sList]);
    }
  }, []);

  return {
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
