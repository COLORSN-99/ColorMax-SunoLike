/**
 * localStorage 会话持久化（R2 / Stage 4.1，ADR-001 过渡方案）
 * 通过 IPersistence 抽象层访问 localStorage，保持向后兼容
 */
import type { Msg } from "./segments.ts";
import { RawLocalStoragePersistence, MemoryPersistence, type IPersistence } from "@colormax/schema";

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
import type { KV } from "./segments.ts";
import { CONFIG } from "@colormax/config";

/**
 * KV 适配器：IPersistence<string> → KV 接口
 * 使用 RawLocalStoragePersistence 避免 JSON 双重编码
 */
class PersistenceKVAdapter implements KV {
  private persistence: IPersistence<string>;
  
  constructor(persistence: IPersistence<string>) {
    this.persistence = persistence;
  }
  
  getItem(key: string): string | null {
    return this.persistence.get(key);
  }
  
  setItem(key: string, value: string): void {
    this.persistence.set(key, value);
  }
  
  removeItem(key: string): void {
    this.persistence.remove(key);
  }
}

/** 全局 KV 实例（通过 IPersistence 访问 localStorage） */
let kvInstance: KV | null = null;

function getKV(): KV {
  if (!kvInstance) {
    if (typeof window !== "undefined") {
      // 使用 RawLocalStoragePersistence（无前缀，无 JSON 编码）保持 100% 向后兼容
      const persistence = new RawLocalStoragePersistence("");
      kvInstance = new PersistenceKVAdapter(persistence);
    } else {
      // SSR 环境：使用 MemoryPersistence
      const persistence = new MemoryPersistence<string>();
      kvInstance = new PersistenceKVAdapter(persistence);
    }
  }
  return kvInstance;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const K_SESSIONS = "cm.sessions";
const K_MSGS = (id: string) => `cm.msgs:${id}`;
const K_BOARD = "cm.board.snapshot";
const K_BOARD_AT = "cm.board.at";
const K_RESUME = (jobId: string) => `cm.resume:${jobId}`;

const SESSION_CAP = CONFIG.storage.sessionCap;
const MSG_CAP = CONFIG.storage.msgCap;
export const BOARD_TTL_MS = CONFIG.storage.boardTtlMs;
export const RESUME_TTL_MS = CONFIG.storage.resumeTtlMs;

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const newSession = (title: string): SessionMeta => ({
  id: Math.random().toString(36).slice(2, 10),
  title: title.slice(0, 40),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

export function listSessions(kv?: KV): SessionMeta[] {
  const kvActual = kv ?? getKV();
  return safeParse<SessionMeta[]>(kvActual.getItem(K_SESSIONS), []);
}

export function saveSessions(kv: KV | undefined, list: SessionMeta[]): void {
  const kvActual = kv ?? getKV();
  try {
    kvActual.setItem(K_SESSIONS, JSON.stringify(list.slice(0, SESSION_CAP)));
  } catch {
    /* 配额异常静默（降级为不持久化，不影响功能） */
  }
}

/** 落盘前收敛：进行中的段标记为非流式（恢复由 replay/watch 补齐），raw 错误截断 */
export function serializeMsgs(msgs: Msg[]): Msg[] {
  return msgs.slice(-MSG_CAP).map((m) => ({
    ...m,
    segments: m.segments.map((s) => {
      if (s.kind === "thinking" && s.streaming) return { ...s, streaming: false };
      if (s.kind === "suno") return s; // 进度块保留终态（下一轮会覆盖）
      if (s.kind === "error")
        return { ...s, raw: s.raw.slice(0, 400), reviewStreaming: false, steps: s.steps.length ? s.steps : ["刷新后可继续或重新发起"] };
      return s;
    }),
  }));
}

export function loadMsgs(kv: KV | undefined, sessionId: string): Msg[] {
  const kvActual = kv ?? getKV();
  return safeParse<Msg[]>(kvActual.getItem(K_MSGS(sessionId)), []);
}

export function saveMsgs(kv: KV | undefined, sessionId: string, msgs: Msg[]): void {
  const kvActual = kv ?? getKV();
  try {
    kvActual.setItem(K_MSGS(sessionId), JSON.stringify(serializeMsgs(msgs)));
  } catch {
    /* 配额异常静默 */
  }
}

/* ===== 作品看板快照（SUNO_COOKIES 失效/冷却期不白屏） ===== */
export function saveBoard<T>(kv: KV | undefined, songs: T[], at = Date.now()): void {
  const kvActual = kv ?? getKV();
  try {
    kvActual.setItem(K_BOARD, JSON.stringify(songs));
    kvActual.setItem(K_BOARD_AT, String(at));
  } catch {
    /* ignore */
  }
}

export function loadBoard<T>(kv: KV | undefined, now = Date.now()): { songs: T[]; at: number } | null {
  const kvActual = kv ?? getKV();
  const at = Number(kvActual.getItem(K_BOARD_AT) ?? "0");
  if (!at || now - at > BOARD_TTL_MS) return null;
  const songs = safeParse<T[]>(kvActual.getItem(K_BOARD), null as unknown as T[]);
  return Array.isArray(songs) ? { songs, at } : null;
}

/* ===== 失败快照冗余（Step6 resume 用；同进程接续，跨进程不接续——用户拍板） ===== */
export function saveResume(kv: KV | undefined, jobId: string, snap: unknown, at = Date.now()): void {
  const kvActual = kv ?? getKV();
  try {
    kvActual.setItem(K_RESUME(jobId), JSON.stringify({ snap, at }));
  } catch {
    /* ignore */
  }
}

export function loadResume<T>(kv: KV | undefined, jobId: string, now = Date.now()): T | null {
  const kvActual = kv ?? getKV();
  const v = safeParse<{ snap: T; at: number } | null>(kvActual.getItem(K_RESUME(jobId)), null);
  if (!v || now - v.at > RESUME_TTL_MS) return null;
  return v.snap;
}

export function clearResume(kv: KV | undefined, jobId: string): void {
  const kvActual = kv ?? getKV();
  kvActual.removeItem(K_RESUME(jobId));
}

/* ===== 刷新恢复三分支（SM-4 核心语义） ===== */
export type RestoreAction =
  | { type: "replay"; jobId: string; msgIndex: number } // 服务端有终态——重放事件历史补齐
  | { type: "watch"; jobId: string; msgIndex: number; fromSeq: number } // 仍在跑——带游标续播
  | { type: "lost"; jobId: string; msgIndex: number } // 服务端进程重启已丢——提示重跑/接续
  | { type: "none"; msgIndex: number };

export function isTerminalMsg(m: Msg): boolean {
  if (m.role !== "assistant" || !m.jobId) return true;
  const kinds = m.segments.map((s) => s.kind);
  return kinds.includes("result") || kinds.includes("error");
}

/**
 * probe: jobId → 服务端现状（"terminal" 已结束 / "running" 在跑 / "gone" 内存已丢）
 * 返回每条消息的恢复动作（不修改消息）。
 */
export async function planRestore(
  msgs: Msg[],
  probe: (jobId: string) => Promise<"terminal" | "running" | "gone">,
): Promise<RestoreAction[]> {
  const out: RestoreAction[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (isTerminalMsg(m)) {
      out.push({ type: "none", msgIndex: i });
      continue;
    }
    const st = await probe(m.jobId!);
    if (st === "gone") out.push({ type: "lost", jobId: m.jobId!, msgIndex: i });
    else if (st === "terminal") out.push({ type: "replay", jobId: m.jobId!, msgIndex: i });
    else out.push({ type: "watch", jobId: m.jobId!, msgIndex: i, fromSeq: m.lastSeq ?? 0 });
  }
  return out;
}
