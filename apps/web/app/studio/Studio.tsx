"use client";

/** ColorMax · Studio Machine —— 模拟录音控制台主壳（行为层不变：useSessions + SegmentView） */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layout, Steps } from "antd";
import { Disc3, Library, SlidersHorizontal } from "lucide-react";
import SongsBoard from "../components/SongsBoard";
import { SegmentView } from "../components/blocks";
import { PHASE_LABEL } from "@/lib/segments";
import { useSessions } from "./useSessions";
import { SERVICE_MARKET, PLUGIN_MARKET } from "../data/market";
import type { Msg } from "@/lib/segments";

const { Sider, Content } = Layout;
const PHASES = ["intent", "plan", "dispatch", "suno", "align", "judge", "deliver"] as const;

function Lamp({ kind }: { kind: "signal" | "rec" | "ok" | "err" | "idle" }) {
  return <span className={`cm-lamp cm-lamp--${kind}`} />;
}

/** 机柜抽屉式会话列表（含当前会话空态） */
function Rail({ sessions, active, onSelect, onCreate }: {
  sessions: { id: string; title: string }[]; active: string; onSelect: (id: string) => void; onCreate: () => void;
}) {
  return (
    <div style={{ padding: "0 10px" }}>
      {sessions.length === 0 && <div style={{ padding: 12, fontSize: 11, color: "#7c7068" }}>暂无走带记录 · 按下 START 开始第一轨</div>}
      {sessions.map((s, i) => {
        const on = s.id === active;
        return (
          <div key={s.id} onClick={() => onSelect(s.id)}
            style={{
              display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", marginTop: 4, cursor: "pointer",
              border: `1px solid ${on ? "#58402c" : "#241d18"}`, borderRadius: 6,
              background: on ? "linear-gradient(180deg,#2a2016,#1d1610)" : "transparent",
              transition: "border-color .15s ease",
            }}>
            <span className="cm-logline" style={{ width: 26 }}>T{String(i + 1).padStart(2, "0")}</span>
            <Lamp kind={on ? "signal" : "idle"} />
            <span style={{ fontSize: 12, color: on ? "#f6f0e8" : "#8a7c6d", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          </div>
        );
      })}
      <button className="cm-knobbtn" style={{ width: "100%", marginTop: 8 }} onClick={onCreate}>＋ 新走带</button>
    </div>
  );
}

/** 设备清单（App Market / Plugins 机柜卡） */
function Devices({ title, items }: { title: string; items: { name: string; desc: string; status?: string; tag?: string }[] }) {
  return (
    <>
      <div style={{ padding: "14px 14px 4px", fontSize: 10, letterSpacing: ".18em", color: "#7c7068", textTransform: "uppercase", fontWeight: 600 }}>{title}</div>
      <div style={{ padding: "0 10px" }}>
        {items.map((it) => (
          <div key={it.name} className="cm-panel" style={{ padding: "8px 10px", marginTop: 6, borderRadius: 8 }}>
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
              <Lamp kind={it.status === "running" ? "ok" : "idle"} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{it.name}</span>
              <span className="cm-chip" style={{ marginLeft: "auto" }}>{it.status === "running" ? "在线" : (it.tag ?? "待装")}</span>
            </div>
            <div style={{ fontSize: 11, color: "#7c7068", marginTop: 3, lineHeight: 1.5 }}>{it.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function AssistantMsg({ m, onOpenBoard }: { m: Msg; onOpenBoard: () => void }) {
  return (
    <div className="cm-panel cm-agent">
      <div className="cm-agent__tag" style={{ marginBottom: 6 }}>Machine</div>
      {m.segments.length === 0
        ? <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#8a7c6d" }}><Lamp kind="rec" /> 接入事件流…</div>
        : m.segments.map((s, i) => <SegmentView key={i} seg={s} onOpenBoard={onOpenBoard} />)}
    </div>
  );
}

export default function Studio() {
  const [prompt, setPrompt] = useState("给妈妈写一首温暖的中文抒情歌");
  const { sessions, active, msgs, phase, busy, engineNote, selectSession, createSession, run, resumePending } = useSessions();
  const [tab, setTab] = useState<"console" | "archive">("console");
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (active) void resumePending(); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" }); }, [msgs]);

  const submit = () => { const p = prompt.trim(); if (p && !busy) void run(p); };
  const stepIndex = phase ? PHASES.indexOf(phase as (typeof PHASES)[number]) : -1;

  return (
    <Layout style={{ height: "100vh", background: "transparent" }}>
      <Sider width={300} style={{ borderRight: "1px solid #241d18", overflow: "auto" }} className="cm-rail">
        <div style={{ padding: "20px 16px 14px", borderBottom: "1px solid #241d18" }}>
          <div className="cm-brand" style={{ fontSize: 30, lineHeight: 1.05, color: "#f6f0e8" }}>Color<span style={{ color: "#f3aa2f" }}>Max</span></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
            <Lamp kind="ok" />
            <span style={{ fontSize: 10, letterSpacing: ".24em", textTransform: "uppercase", color: "#7c7068" }}>Studio Machine · MK-01</span>
          </div>
        </div>
        <Devices title="机内设备 · Devices" items={SERVICE_MARKET} />
        <Devices title="插件槽 · Plug-ins" items={PLUGIN_MARKET} />
        <div style={{ padding: "18px 14px 6px", display: "flex", alignItems: "center", borderTop: "1px solid #241d18" }}>
          <span style={{ fontSize: 10, letterSpacing: ".18em", color: "#7c7068", textTransform: "uppercase", fontWeight: 600 }}>走带记录 · Takes</span>
        </div>
        <Rail sessions={sessions.map((s) => ({ id: s.id, title: s.title }))} active={active} onSelect={selectSession} onCreate={() => createSession("新走带")} />
        <div style={{ height: 24 }} />
      </Sider>

      <Content style={{ display: "flex", flexDirection: "column", background: "transparent" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "10px 22px", borderBottom: "1px solid #241d18" }}>
          <button className="cm-knobbtn" style={tab === "console" ? { borderColor: "#58402c", color: "#f3aa2f" } : {}} onClick={() => setTab("console")}>
            <SlidersHorizontal size={12} style={{ verticalAlign: -2 }} /> 控制台
          </button>
          <button className="cm-knobbtn" style={tab === "archive" ? { borderColor: "#58402c", color: "#f3aa2f" } : {}} onClick={() => setTab("archive")}>
            <Library size={12} style={{ verticalAlign: -2 }} /> 档案柜
          </button>
          <span style={{ marginLeft: 10, fontSize: 12, color: "#8a7c6d" }}>
            {active && sessions.find((s) => s.id === active)?.title}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
            {engineNote && <span className="cm-chip" title={engineNote}>引擎 {engineNote.includes("Mock") ? "MOCK" : "SUNO"}</span>}
            <Link href="/settings" style={{ color: "#b9ab9f", fontSize: 12 }}>机位设置 ↗</Link>
          </span>
        </div>

        {tab === "archive" ? (
          <div style={{ flex: 1, overflow: "auto", padding: 22 }}>
            <SongsBoard />
          </div>
        ) : (
          <>
            {stepIndex >= 0 && (
              <div style={{ padding: "14px 22px 0" }}>
                <Steps size="small" current={stepIndex} status={busy ? "process" : "finish"}
                  styles={{ itemContent: { fontSize: 11 } }}
                  items={PHASES.map((ph) => ({ title: PHASE_LABEL[ph], description: phase === ph ? "运行中" : undefined }))}
                />
              </div>
            )}
            <div ref={streamRef} style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
              {msgs.length === 0 ? (
                <div style={{ maxWidth: 560, margin: "8vh auto 0", textAlign: "center" }}>
                  <Disc3 size={44} color="#f3aa2f" style={{ opacity: .85 }} />
                  <div className="cm-brand" style={{ fontSize: 34, marginTop: 10 }}>一句话，一首歌。</div>
                  <div style={{ fontSize: 13, color: "#8a7c6d", marginTop: 8, lineHeight: 1.8 }}>
                    意图分析 → 创作规划 → Suno Sub-Agent 联合编曲 → 对齐评判 → 压片交付。
                    <br />思考流、机台日志与生成进度全程可视。
                  </div>
                </div>
              ) : (
                <div style={{ maxWidth: 860, margin: "0 auto" }}>
                  {msgs.map((m) => m.role === "user" ? (
                    <div key={m.id} className="cm-user">
                      <div className="cm-user__tape">{m.segments.map((s) => (s.kind === "text" ? s.text : "")).join("")}</div>
                    </div>
                  ) : (
                    <AssistantMsg key={m.id} m={m} onOpenBoard={() => setTab("archive")} />
                  ))}
                </div>
              )}
            </div>
            <div className="cm-composer" style={{ padding: "12px 22px 18px" }}>
              <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", gap: 10, alignItems: "flex-end" }}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  rows={2}
                  placeholder="描述你的创作想法…（Enter 走带 · Shift+Enter 换行）"
                  style={{
                    flex: 1, resize: "none", padding: "12px 14px", borderRadius: 8, fontSize: 14, lineHeight: 1.6,
                    color: "#f6f0e8", background: "#120e0b", border: "1px solid #3d312a", outline: "none", fontFamily: "var(--cm-ui)",
                  }}
                />
                <button className="cm-transport" onClick={submit} disabled={busy || !prompt.trim()}>
                  <Lamp kind={busy ? "rec" : "idle"} /> {busy ? "REC" : "START"}
                </button>
              </div>
            </div>
          </>
        )}
      </Content>
    </Layout>
  );
}
