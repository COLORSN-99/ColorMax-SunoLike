import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listSessions, saveSessions, newSession, loadMsgs, saveMsgs, serializeMsgs,
  saveBoard, loadBoard, saveResume, loadResume, clearResume, planRestore, isTerminalMsg,
  BOARD_TTL_MS, RESUME_TTL_MS, type KV,
} from "../lib/storage.ts";
import type { Msg } from "../lib/segments.ts";

function memKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const asstMsg = (jobId: string, kinds: Msg["segments"][number]["kind"][], lastSeq = 5): Msg => ({
  id: "m-" + jobId, role: "assistant", jobId, lastSeq,
  segments: kinds.map((k) => k === "text" ? { kind: "text", text: "t" } : { kind: k } as Msg["segments"][number]),
});

test("S4-T1 sessions/msgs 序列化往返 + 截断上限 + 坏数据降级", () => {
  const kv = memKV();
  assert.deepEqual(listSessions(kv), []);
  const many = Array.from({ length: 25 }, (_, i) => newSession(`会话 ${i}`));
  saveSessions(kv, many);
  assert.equal(listSessions(kv).length, 20, "cap 20");
  const msgs: Msg[] = [
    { id: "u1", role: "user", segments: [{ kind: "text", text: "hi" }] },
    { id: "a1", role: "assistant", jobId: "j1", lastSeq: 9,
      segments: [
        { kind: "thinking", callId: "c", node: "plan", content: "长", reasoning: "r", streaming: true },
        { kind: "error", roundId: "r", headline: "h", category: "quota", steps: [], resolvableByCli: false, raw: "x".repeat(5000), reviewStreaming: true, reviewText: "" },
      ] },
  ];
  saveMsgs(kv, "s1", msgs);
  const back = loadMsgs(kv, "s1");
  assert.equal(back.length, 2);
  const a = back[1];
  assert.equal(a.segments[0].kind, "thinking");
  assert.ok(a.segments[0].kind === "thinking" && a.segments[0].streaming === false, "恢复时流式标记收敛");
  assert.ok(a.segments[1].kind === "error" && a.segments[1].raw.length === 400, "raw 截断 400");
  kv.map.set("cm.msgs:bad", "{not json");
  assert.deepEqual(loadMsgs(kv, "bad"), [], "坏数据降级空列表");
});

test("S4-T2 恢复三分支：terminal→replay / running→watch(fromSeq) / gone→lost；已终结消息 none", async () => {
  const msgs: Msg[] = [
    asstMsg("done-job", ["result"], 12),
    asstMsg("running-job", ["thinking"], 7),
    asstMsg("gone-job", ["text"], 3),
  ];
  const actions = await planRestore(msgs, async (id) =>
    id === "done-job" ? "terminal" : id === "running-job" ? "running" : "gone");
  assert.deepEqual(actions.map((a) => a.type), ["none", "watch", "lost"]);
  const watch = actions[1];
  assert.ok(watch.type === "watch" && watch.fromSeq === 7 && watch.jobId === "running-job");
  // 含 error 卡的消息视为已终结（不再续播）
  assert.ok(isTerminalMsg(asstMsg("e", ["error"])));
});

test("S4-T3 看板快照 TTL + resume 缓存 TTL/清除", () => {
  const kv = memKV();
  assert.equal(loadBoard(kv), null);
  saveBoard(kv, [{ id: "1" }], 1000);
  assert.deepEqual(loadBoard(kv, 1000 + BOARD_TTL_MS - 1)?.songs, [{ id: "1" }]);
  assert.equal(loadBoard(kv, 1000 + BOARD_TTL_MS + 1), null, "TTL 过期→null");
  saveResume(kv, "j1", { failPhase: "suno" }, 2000);
  assert.deepEqual(loadResume(kv, "j1", 2000 + RESUME_TTL_MS - 1), { failPhase: "suno" });
  assert.equal(loadResume(kv, "j1", 2000 + RESUME_TTL_MS + 1), null);
  clearResume(kv, "j1");
  assert.equal(loadResume(kv, "j1", 2001), null);
});
