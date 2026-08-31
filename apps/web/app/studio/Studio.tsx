"use client";

/** 创作室主壳（Stage 6.1）：对话窗口=segment 流式渲染；SSE 帧解析→applyEvent reducer */
import { useRef, useState } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Layout, List, Tag, Typography, Steps } from "antd";
import { Sender, Conversations, Welcome } from "@ant-design/x";
import SongsBoard from "../components/SongsBoard";
import { SegmentView } from "../components/blocks";
import { applyEvent, PHASE_LABEL, type Segment, type Evt } from "../../lib/segments";
import { parseSseBuffer } from "../../lib/sse";
import { SERVICE_MARKET, PLUGIN_MARKET } from "../data/market";

const { Sider, Content } = Layout;
const { Text } = Typography;

const PHASES = ["intent", "plan", "dispatch", "suno", "align", "judge", "deliver"] as const;

export interface Msg {
  id: string;
  role: "user" | "assistant";
  jobId?: string;
  roundId?: string;
  segments: Segment[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

export default function Studio() {
  const [prompt, setPrompt] = useState("给妈妈写一首温暖的中文抒情歌");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const [sessions] = useState([
    { key: "s1", label: "给妈妈写一首温暖的中文抒情歌" },
    { key: "s2", label: "摇滚风格的毕业告别歌" },
  ]);
  const [active, setActive] = useState("s1");
  const [tab, setTab] = useState("studio");
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenSeq = useRef(0);

  const patchAssistant = (jobId: string, fn: (segs: Segment[]) => Segment[]) => {
    setMsgs((m) => {
      const i = m.findIndex((x) => x.jobId === jobId);
      if (i < 0) return m;
      return m.map((x, j) => (j === i ? { ...x, segments: fn(x.segments), roundId: x.roundId } : x));
    });
  };

  const run = async (input?: string) => {
    const p = (input ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true);
    setPhase(null);
    setEngineNote(null);
    seenSeq.current = 0;
    setMsgs((m) => [...m, { id: uid(), role: "user", segments: [{ kind: "text", text: p }] }]);
    let jobId = "";
    try {
      const created = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, sessionId: active }),
      });
      if (!created.ok) throw new Error(`创建任务失败 HTTP ${created.status}`);
      const { id, engineModeDoc } = (await created.json()) as { id: string; engineModeDoc?: string };
      jobId = id;
      if (engineModeDoc) setEngineNote(engineModeDoc);
      setMsgs((m) => [...m, { id: uid(), role: "assistant", jobId: id, segments: [] }]);

      const res = await fetch(`/api/jobs/${id}/events`);
      if (!res.ok || !res.body) throw new Error(`事件流失败 HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
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
            if (e.seq <= seenSeq.current) continue; // 补帧去重（幂等）
            seenSeq.current = e.seq;
            e.roundId = e.roundId ?? f.id;
          }
          if (f.event === "status") {
            if (e.status === "done" || e.status === "failed") {
              // 恢复场景：历史帧会补齐，这里不动
            }
            continue;
          }
          if (f.event === "phase") setPhase(e.phase ?? null);
          if (f.event === "done") setPhase("deliver");
          patchAssistant(id, (segs) => applyEvent(segs, { ...e, jobId: id }));
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const errSeg: Segment = {
        kind: "error", roundId: uid(), headline: "任务启动失败", category: "unknown", steps: [],
        resolvableByCli: false, raw: msg, reviewStreaming: false, reviewText: "",
      };
      if (jobId) patchAssistant(jobId, (segs) => [...segs, errSeg]);
      else setMsgs((m) => [...m, { id: uid(), role: "assistant", segments: [errSeg] }]);
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = phase ? PHASES.indexOf((phase as (typeof PHASES)[number])) : -1;

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorBgBase: "#0d0d0f", colorBgContainer: "#161618", colorBorder: "#2a2a2e", colorText: "#e8e8ea", borderRadius: 6, fontSize: 13 },
      }}
    >
      <Layout style={{ height: "100vh", background: "#0d0d0f" }}>
        <Sider width={300} style={{ background: "#121214", borderRight: "1px solid #242428", overflow: "auto" }}>
          <div style={{ padding: "12px 12px 4px" }}>
            <Text strong style={{ color: "#9a9aa0", fontSize: 11, letterSpacing: ".8px" }}>应用服务 · APP MARKET</Text>
          </div>
          <List size="small" style={{ padding: "0 8px" }} dataSource={SERVICE_MARKET}
            renderItem={(it) => (
              <List.Item style={{ borderBlockEnd: "none", padding: "6px 10px" }}>
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Text style={{ fontSize: 13, color: "#e8e8ea" }}>{it.name}</Text>
                    <Tag color={it.status === "running" ? "green" : "default"} style={{ fontSize: 10, lineHeight: "16px", marginInlineEnd: 0 }}>
                      {it.status === "running" ? "运行中" : "即将上线"}
                    </Tag>
                    <Tag style={{ fontSize: 10, marginInlineEnd: 0, background: "#1f1f24" }}>{it.tag}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{it.desc}</Text>
                </div>
              </List.Item>
            )}
          />
          <div style={{ padding: "14px 12px 4px" }}>
            <Text strong style={{ color: "#9a9aa0", fontSize: 11, letterSpacing: ".8px" }}>插件 · PLUGINS</Text>
          </div>
          <List size="small" style={{ padding: "0 8px" }} dataSource={PLUGIN_MARKET}
            renderItem={(it) => (
              <List.Item style={{ borderBlockEnd: "none", padding: "6px 10px" }}>
                <div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Text style={{ fontSize: 13 }}>{it.name}</Text>
                    <Tag style={{ fontSize: 10, marginInlineEnd: 0 }}>{it.tag}</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{it.desc}</Text>
                </div>
              </List.Item>
            )}
          />
          <div style={{ padding: "18px 12px 4px", borderTop: "1px solid #242428" }}>
            <Text strong style={{ color: "#9a9aa0", fontSize: 11, letterSpacing: ".8px" }}>对话历史 · SESSIONS</Text>
          </div>
          <Conversations
            style={{ padding: "0 8px 24px" }}
            items={sessions.map((s) => ({ key: s.key, label: s.label }))}
            activeKey={active}
            onActiveChange={setActive}
          />
        </Sider>

        <Content style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px 20px", borderBottom: "1px solid #242428", display: "flex", gap: 12, alignItems: "center" }}>
            <Text strong>color-max / studio</Text>
            <Link href="/settings"><Text style={{ color: "#6a6acd" }}>LLM 设置 ↗</Text></Link>
            <button style={{ background: "transparent", border: "none", color: tab === "studio" ? "#e8e8ea" : "#9a9aa0", fontSize: 13, cursor: "pointer" }} onClick={() => setTab("studio")}>创作室</button>
            <button style={{ background: "transparent", border: "none", color: tab === "board" ? "#e8e8ea" : "#9a9aa0", fontSize: 13, cursor: "pointer" }} onClick={() => setTab("board")}>作品看板</button>
          </div>

          {tab === "board" ? (
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              <SongsBoard />
            </div>
          ) : (
            <>
              {stepIndex >= 0 && (
                <div style={{ padding: "12px 20px 0" }}>
                  <Steps size="small" current={stepIndex}
                    items={PHASES.map((ph) => ({ title: PHASE_LABEL[ph], description: phase === ph ? "执行中" : undefined }))}
                  />
                </div>
              )}
              <div ref={scrollRef} style={{ flex: 1, overflow: "auto", padding: 20 }}>
                {msgs.length === 0 ? (
                  <Welcome
                    icon={<span style={{ fontSize: 30 }}>🎵</span>}
                    title="ColorMax 创作室"
                    description="一句话，一首歌。多 Agent 联合编曲：意图 → 规划 → Suno Sub-Agent → 对齐评判 → 交付。全过程流式可见：思考折叠块 / 工具终端 / 生成进度。"
                  />
                ) : (
                  msgs.map((m) =>
                    m.role === "user" ? (
                      <div key={m.id} style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0" }}>
                        <div style={{ background: "#2a2a3f", color: "#e8e8ea", borderRadius: 8, padding: "8px 12px", maxWidth: "70%", fontSize: 13, whiteSpace: "pre-wrap" }}>
                          {m.segments.map((s) => (s.kind === "text" ? s.text : "")).join("")}
                        </div>
                      </div>
                    ) : (
                      <div key={m.id} style={{ margin: "10px 0", paddingLeft: 2, borderLeft: "2px solid #2a2a2e" }}>
                        <div style={{ fontSize: 10, color: "#55555c", margin: "0 0 2px 10px" }}>agent</div>
                        <div style={{ padding: "0 10px" }}>
                          {m.segments.length === 0 && busy ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>连接事件流…</Text>
                          ) : (
                            m.segments.map((s, i) => <SegmentView key={i} seg={s} onOpenBoard={() => setTab("board")} />)
                          )}
                        </div>
                      </div>
                    ),
                  )
                )}
                {engineNote && <div style={{ fontSize: 11, color: "#9a9aa0", marginTop: 8 }}>{engineNote}</div>}
              </div>
            </>
          )}

          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #242428" }}>
            <Sender loading={busy} value={prompt} onChange={setPrompt} onSubmit={run}
              placeholder="描述你的创作想法…（Enter 发送）" />
          </div>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
