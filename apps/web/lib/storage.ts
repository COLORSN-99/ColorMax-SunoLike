/**
 * localStorage 会话持久化（R2 / Stage 4.1，ADR-001 过渡方案）
 * 边界：仅浏览器端；不引入任何服务端/DB 持久化。换 agent runtime/工作流编排时整体迁 SQL。
 * 纯函数 + 注入 KV（浏览器传 window.localStorage，测试传内存桩）。
 */
import type { Msg } from "./segments.ts";

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

const SESSION_CAP = 20;
const MSG_CAP = 200;
export const BOARD_TTL_MS = 10 * 60_000;
export const RESUME_TTL_MS = 24 * 3600_000;

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

export function listSessions(kv: KV): SessionMeta[] {
  return safeParse<SessionMeta[]>(kv.getItem(K_SESSIONS), []);
}

export function saveSessions(kv: KV, list: SessionMeta[]): void {
  try {
    kv.setItem(K_SESSIONS, JSON.stringify(list.slice(0, SESSION_CAP)));
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

export function loadMsgs(kv: KV, sessionId: string): Msg[] {
  return safeParse<Msg[]>(kv.getItem(K_MSGS(sessionId)), []);
}

export function saveMsgs(kv: KV, sessionId: string, msgs: Msg[]): void {
  try {
    kv.setItem(K_MSGS(sessionId), JSON.stringify(serializeMsgs(msgs)));
  } catch {
    /* 配额异常静默 */
  }
}

/* ===== 作品看板快照（SUNO_COOKIES 失效/冷却期不白屏） ===== */
export function saveBoard<T>(kv: KV, songs: T[], at = Date.now()): void {
  try {
    kv.setItem(K_BOARD, JSON.stringify(songs));
    kv.setItem(K_BOARD_AT, String(at));
  } catch {
    /* ignore */
  }
}

export function loadBoard<T>(kv: KV, now = Date.now()): { songs: T[]; at: number } | null {
  const at = Number(kv.getItem(K_BOARD_AT) ?? "0");
  if (!at || now - at > BOARD_TTL_MS) return null;
  const songs = safeParse<T[]>(kv.getItem(K_BOARD), null as unknown as T[]);
  return Array.isArray(songs) ? { songs, at } : null;
}

/* ===== 失败快照冗余（Step6 resume 用；同进程接续，跨进程不接续——用户拍板） ===== */
export function saveResume(kv: KV, jobId: string, snap: unknown, at = Date.now()): void {
  try {
    kv.setItem(K_RESUME(jobId), JSON.stringify({ snap, at }));
  } catch {
    /* ignore */
  }
}

export function loadResume<T>(kv: KV, jobId: string, now = Date.now()): T | null {
  const v = safeParse<{ snap: T; at: number } | null>(kv.getItem(K_RESUME(jobId)), null);
  if (!v || now - v.at > RESUME_TTL_MS) return null;
  return v.snap;
}

export function clearResume(kv: KV, jobId: string): void {
  kv.removeItem(K_RESUME(jobId));
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
