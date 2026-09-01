"use client";

/**
 * Analog Console · 机台模块 —— agent 事件流的设备化呈现：
 * SIGNAL PATH（思考）/ MACHINE LOG（工具）/ GENERATOR（生成）/ WAITING GATE（人工验证）/
 * SESSION SHEET（计划）/ MIX REVIEW（评判）/ PRESSED（交付）/ STOP（失败）。
 * 仅渲染层；事件→segments 归约在 lib/segments.ts，行为不变。
 */
import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, Brain, Disc3, Gauge, Play, SlidersHorizontal, Terminal } from "lucide-react";
import type { Segment } from "@/lib/segments";

const NODE_LABEL: Record<string, string> = {
  intent: "意图分析", plan: "创作规划", judge: "混音评判", "error-review": "错误诊断",
};

function Lamp({ kind }: { kind: "signal" | "rec" | "ok" | "err" | "idle" }) {
  return <span className={`cm-lamp cm-lamp--${kind}`} />;
}

function Chevron({ open }: { open: boolean }) {
  return <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .18s ease", display: "inline-block", fontSize: 9, color: "#8a7c6d" }}>▶</span>;
}

function Leds({ pct, hot }: { pct: number; hot?: boolean }) {
  const on = Math.max(0, Math.min(14, Math.round((pct / 100) * 14)));
  return (
    <span className="cm-leds" style={{ width: 96 }}>
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} className={i < on ? (hot && i > 10 ? "on hot" : "on") : undefined} />
      ))}
    </span>
  );
}

/* ================= SIGNAL PATH（LLM 思考） ================= */
export function ThinkingBlock({ seg }: { seg: Extract<Segment, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [open, seg.content, seg.reasoning]);
  const tail = (seg.reasoning || seg.content).slice(-36).replace(/\n/g, " ");
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <Brain size={13} style={{ color: "#f3aa2f" }} />
        <span>SIGNAL PATH · {NODE_LABEL[seg.node] ?? seg.node}</span>
        {seg.streaming ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#f3aa2f", fontSize: 11 }}>
            <Lamp kind="signal" /> live{tail ? ` · …${tail}` : ""}
          </span>
        ) : (
          <span className="cm-head__meta">{seg.ms}ms{seg.reasoning ? " · 含推理链" : ""}</span>
        )}
      </div>
      {open && (
        <div ref={scroller} className="cm-body cm-body--scroll">
          {seg.reasoning && (
            <div style={{ marginBottom: seg.content ? 10 : 0, color: "#8a7c6d" }}>
              <div className="cm-agent__tag" style={{ marginBottom: 3 }}>REASONING</div>
              {seg.reasoning}
            </div>
          )}
          {seg.content && (
            <div style={{ color: "#d9c9a6" }}>
              <div className="cm-agent__tag" style={{ marginBottom: 3 }}>OUTPUT</div>
              {seg.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= MACHINE LOG（工具执行） ================= */
export function TerminalBlock({ seg }: { seg: Extract<Segment, { kind: "terminal" }> }) {
  const [open, setOpen] = useState(seg.status !== "ok");
  const lamp = seg.status === "error" ? "err" : seg.status === "running" ? "rec" : "ok";
  const foot = seg.status === "running" ? "RUNNING" : seg.status === "error" ? "FAILED" : `DONE${seg.ms !== undefined ? ` · ${seg.ms}ms` : ""}`;
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <Terminal size={13} style={{ color: "#48d8bd" }} />
        <span style={{ fontFamily: "var(--cm-mono)" }}>{seg.tool}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a7c6d" }}>
          <Lamp kind={lamp} /> {foot}
        </span>
        {!open && <span className="cm-head__meta">{seg.lines.length} 行</span>}
      </div>
      {open && (
        <div className="cm-body" style={{ padding: "8px 12px" }}>
          {seg.lines.map((l, i) => (
            <div key={i} className={`cm-logline ${l.startsWith("!") ? "err" : l.startsWith("$") ? "cmd" : l.startsWith("·") || l.startsWith("✓") ? "ok" : "dim"}`}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= GENERATOR（Suno 生成进度） ================= */
export function GeneratorBlock({ seg }: { seg: Extract<Segment, { kind: "suno" }> }) {
  const pct = seg.total ? (seg.done / seg.total) * 100 : 8;
  const lamp = seg.status === "complete" ? "ok" : seg.status === "error" ? "err" : "rec";
  return (
    <div className="cm-panel" style={{ margin: "8px 0", padding: "10px 12px" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <Disc3 size={15} style={{ color: "#f3aa2f" }} />
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>Generator</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a7c6d" }}>
          <Lamp kind={lamp} /> {seg.status === "complete" ? "READY" : seg.status === "error" ? "ERROR" : "PRINTING"}
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--cm-mono)", fontSize: 11, color: "#b9ab9f" }}>
          {seg.done}/{seg.total} · {Math.round(seg.elapsedMs / 1000)}s
        </span>
      </div>
      <div style={{ marginTop: 8 }}>
        <Leds pct={pct} hot={seg.status === "error"} />
      </div>
      {seg.note && <div className="cm-logline dim" style={{ marginTop: 6 }}>{seg.note}</div>}
    </div>
  );
}

/* ================= WAITING GATE（人工验证 pending） ================= */
export function WaitGate({ seg }: { seg: Extract<Segment, { kind: "wait" }> }) {
  const [now, setNow] = useState(() => Date.now());
  const markRef = useRef({ key: "", at: 0 });
  if (seg.state === "waiting" && markRef.current.key !== `${seg.elapsedMs}`) {
    markRef.current = { key: `${seg.elapsedMs}`, at: Date.now() };
  }
  useEffect(() => {
    if (seg.state !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [seg.state]);
  const live = seg.state === "waiting" ? seg.elapsedMs + Math.max(0, now - markRef.current.at) : seg.elapsedMs;
  const remainMin = Math.ceil(Math.max(0, seg.ttlMs - live) / 60000);
  if (seg.state === "passed")
    return (
      <div className="cm-panel" style={{ margin: "8px 0", padding: "9px 12px", display: "flex", gap: 8, alignItems: "center", borderColor: "#2f5d46" }}>
        <Lamp kind="ok" />
        <span style={{ fontSize: 12, color: "#95d36e" }}>验证通过 —— 走带恢复，继续生成</span>
      </div>
    );
  return (
    <div className="cm-panel" style={{ margin: "8px 0", padding: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <Gauge size={15} style={{ color: "#f3aa2f" }} />
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>Waiting Gate · 等待人工验证</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--cm-mono)", fontSize: 11, color: "#f3aa2f" }}>剩 {remainMin} 分</span>
      </div>
      <div className="cm-vu">
        <div className="cm-vu__redzone" />
        <div className="cm-vu__needle" />
        <div style={{ position: "absolute", left: 10, top: 8, fontSize: 10, letterSpacing: ".2em", color: "#6b4f2a" }}>hCaptcha · hCaptcha 声闸</div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
        <a className="cm-transport" style={{ textDecoration: "none" }} href="https://suno.com/create" target="_blank" rel="noreferrer">
          <Play size={13} /> 去 suno.com 过一次验证
        </a>
        <span style={{ fontSize: 11, color: "#8a7c6d" }}>通过后自动续跑，无需回复；超时后回复「继续」可接续</span>
      </div>
    </div>
  );
}

/* ================= SESSION SHEET（创作计划） ================= */
export function SessionSheet({ plan }: { plan: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <SlidersHorizontal size={13} style={{ color: "#f3aa2f" }} />
        <span>SESSION SHEET · 创作计划</span>
        <span className="cm-head__meta">{open ? "收起" : "查看"}</span>
      </div>
      {open && <pre className="cm-body" style={{ fontFamily: "var(--cm-mono)", fontSize: 11, color: "#d9c9a6", maxHeight: 260, overflow: "auto", margin: 0 }}>{JSON.stringify(plan, null, 2)}</pre>}
    </div>
  );
}

/* ================= MIX REVIEW（评判） ================= */
export function MixReview({ report }: { report: Record<string, unknown> }) {
  const r = report as unknown as {
    score: number; verdict: string; retried: number; comment?: string;
    perDimension?: Record<string, number>;
    rules?: { name: string; passed: boolean; blocking?: boolean }[];
  };
  return (
    <div className="cm-panel" style={{ margin: "8px 0", padding: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Activity size={14} style={{ color: "#f3aa2f" }} />
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>Mix Review</span>
        <span className="cm-chip" style={{ marginLeft: "auto" }}>
          <Lamp kind={r.verdict === "pass" ? "ok" : "rec"} />
          {r.verdict === "pass" ? "PASS" : r.verdict === "give-up" ? "GIVE UP" : "RE-TAKE"} · {r.score}/5 · 第 {r.retried} 次重派
        </span>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {Object.entries(r.perDimension ?? {}).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 66, fontSize: 11, color: "#8a7c6d", textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</span>
            <Leds pct={(v / 5) * 100} />
            <span style={{ fontFamily: "var(--cm-mono)", fontSize: 11, color: "#b9ab9f", marginLeft: "auto" }}>{(v * 20 - 100).toFixed(0)} dB</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {(r.rules ?? []).map((x) => (
          <span key={x.name} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11, color: x.passed ? "#95d36e" : x.blocking === false ? "#f3aa2f" : "#df5260" }}>
            <Lamp kind={x.passed ? "ok" : x.blocking === false ? "signal" : "err"} /> {x.name}{x.blocking === false ? "（软）" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ================= PRESSED（交付） ================= */
export function Pressed({ seg, onOpenArchive }: { seg: Extract<Segment, { kind: "result" }>; onOpenArchive: () => void }) {
  return (
    <div className="cm-panel" style={{ margin: "10px 0", padding: 12, borderColor: "#5a4630" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="cm-vinyl" style={{ width: 54, flex: "none" }}>
          <div className="cm-vinyl__disc" />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lamp kind="ok" />
            <span style={{ fontSize: 12, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 700, color: "#f3aa2f" }}>Pressed</span>
          </div>
          <div style={{ fontFamily: "var(--cm-display)", fontSize: 18, marginTop: 2 }}>《{seg.song.title}》</div>
          <div className="cm-logline dim" style={{ marginTop: 2 }}>{seg.song.durationSec}s · {seg.song.sourceFormat} · 已入库</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="cm-transport" onClick={onOpenArchive}><Play size={13} /> 进档案柜播放</button>
        </div>
      </div>
    </div>
  );
}

/* ================= STOP（失败） ================= */
function friendlyCategory(raw: string): { kind: string; title: string; tips: string[] } {
  if (/LLM HTTP 402|Insufficient Balance|余额不足|欠费|arrears/i.test(raw))
    return { kind: "llm", title: "LLM 服务商余额不足（HTTP 402）", tips: ["到服务商控制台充值（DeepSeek：platform.deepseek.com → Balance）", "或到「机位设置」切换到其他有额度的服务商/本地 Ollama", "之后直接发送「继续」从失败落点接续"] };
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network|LLM/i.test(raw))
    return { kind: "llm", title: "LLM 端点不可达", tips: ["检查「机位设置」中的端点/Key/Model", "本地端点示例：http://localhost:11434/v1（Ollama）"] };
  if (/CAPTCHA/i.test(raw))
    return { kind: "captcha", title: "Suno 风控验证（CAPTCHA）", tips: ["浏览器打开 suno.com/create 人工过一次验证后重试", "或更换 SUNO_COOKIES（|| 分隔多账号）"] };
  if (/配额|quota/i.test(raw)) return { kind: "quota", title: "Suno 配额不足", tips: ["检查 credits 余量或更换账号"] };
  if (/cookie|401|429|unauthorized|expired/i.test(raw))
    return { kind: "cookie", title: "Suno 会话失效", tips: ["重新导出 suno.com Cookie 填入 .env.local 后重启"] };
  return { kind: "generic", title: "走带中止", tips: ["稍后重试；展开调试抽屉查看原始错误"] };
}

export function StopPlate({ seg }: { seg: Extract<Segment, { kind: "error" }> }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const fb = seg.category === "unknown" ? friendlyCategory(seg.raw) : null;
  const headline = fb ? fb.title : seg.headline;
  const steps = fb ? fb.tips : seg.steps;
  return (
    <div className="cm-panel" style={{ margin: "10px 0", borderColor: "#5a2e2c", background: "linear-gradient(180deg,#2a1715, #1d1815 46px)" }}>
      <div className="cm-panel__label" style={{ color: "#df5260", borderBottomColor: "#4a2723" }}>
        <AlertTriangle size={13} /> {headline}{seg.reviewStreaming ? " · 诊断中…" : ""}
      </div>
      <div style={{ padding: "10px 12px" }}>
        {seg.reviewStreaming && seg.reviewText && <div className="cm-logline dim" style={{ marginBottom: 6 }}>{seg.reviewText}▌</div>}
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#d8cfc4", lineHeight: 1.8 }}>
          {steps.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        {!seg.reviewStreaming && (
          <div style={{ fontSize: 11, color: "#7c7068", marginTop: 6 }}>修复后直接发送「继续」——从失败落点接续，不重跑已完成步骤</div>
        )}
        {seg.resolvableByCli && seg.cliSuggestion && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            <code className="cm-body" style={{ flex: 1, margin: 0, color: "#95d36e", fontSize: 11, fontFamily: "var(--cm-mono)" }}>{seg.cliSuggestion}</code>
            <button className="cm-knobbtn" onClick={() => navigator.clipboard?.writeText(seg.cliSuggestion ?? "")}>复制</button>
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#7c7068", cursor: "pointer" }} onClick={() => setDebugOpen(!debugOpen)}>
            <Chevron open={debugOpen} /> 调试抽屉
          </span>
          {debugOpen && <pre className="cm-body" style={{ fontFamily: "var(--cm-mono)", fontSize: 10, color: "#8a7c6d", maxHeight: 160, overflow: "auto" }}>{seg.raw}</pre>}
        </div>
      </div>
    </div>
  );
}

/* ================= 分发 ================= */
export function SegmentView({ seg, onOpenBoard }: { seg: Segment; onOpenBoard: () => void }) {
  switch (seg.kind) {
    case "text":
      return <div className="cm-msg">{seg.text}</div>;
    case "thinking":
      return seg.content || seg.reasoning ? <ThinkingBlock seg={seg} /> : null;
    case "terminal":
      return <TerminalBlock seg={seg} />;
    case "suno":
      return <GeneratorBlock seg={seg} />;
    case "wait":
      return <WaitGate seg={seg} />;
    case "plan":
      return <SessionSheet plan={seg.plan} />;
    case "judge":
      return <MixReview report={seg.report as Record<string, unknown>} />;
    case "result":
      return <Pressed seg={seg} onOpenArchive={onOpenBoard} />;
    case "error":
      return <StopPlate seg={seg} />;
  }
}
