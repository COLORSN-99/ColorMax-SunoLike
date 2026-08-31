"use client";

/** Stage 6.1【1】【2】【3】【4】对话流块组件：思考折叠/终端小块/Suno 进度/结构化错误卡 + 卡片 */
import { useEffect, useRef, useState } from "react";
import { Card, Tag, Typography, Progress } from "antd";
import Link from "next/link";
import type { Segment } from "../../lib/segments";

const { Text } = Typography;

const NODE_LABEL: Record<string, string> = {
  intent: "意图分析推理", plan: "创作规划推理", judge: "效果评判推理", "error-review": "错误评审推理",
};

function Chevron({ open }: { open: boolean }) {
  return <span style={{ color: "#6a6acd", fontSize: 10, transform: open ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>;
}

const headStyle: React.CSSProperties = {
  display: "flex", gap: 6, alignItems: "center", cursor: "pointer", userSelect: "none",
  padding: "6px 10px", background: "#17171b", border: "1px solid #2a2a2e", borderRadius: 6, fontSize: 12,
};

export function ThinkingBlock({ seg }: { seg: Extract<Segment, { kind: "thinking" }> }) {
  const [open, setOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const tail = seg.streaming && !open;
  useEffect(() => {
    if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [open, seg.content, seg.reasoning]);
  const preview = (seg.reasoning || seg.content).slice(-40).replace(/\n/g, " ") || "…";
  return (
    <div style={{ margin: "6px 0" }}>
      <div style={headStyle} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span style={{ color: "#c8c8cd" }}>🧠 {NODE_LABEL[seg.node] ?? seg.node}</span>
        {seg.streaming ? (
          <Tag color="processing" style={{ marginInlineEnd: 0, fontSize: 10 }}>推理中{tail ? ` · …${preview}` : ""}</Tag>
        ) : (
          <Text type="secondary" style={{ fontSize: 11 }}>{seg.ms}ms{seg.reasoning ? " · 含推理链" : ""}</Text>
        )}
      </div>
      {open && (
        <div
          ref={scroller}
          style={{
            marginTop: 4, padding: "8px 10px", background: "#101013", border: "1px solid #232327",
            borderRadius: 6, maxHeight: 200, overflowY: "auto", fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap",
          }}
        >
          {seg.reasoning && (
            <div style={{ color: "#7c7c85", marginBottom: seg.content ? 8 : 0 }}>
              <div style={{ fontSize: 10, color: "#55555c", marginBottom: 2 }}>推理链</div>
              {seg.reasoning}
            </div>
          )}
          {seg.content && (
            <div style={{ color: "#9ecbff" }}>
              <div style={{ fontSize: 10, color: "#55555c", marginBottom: 2 }}>模型输出</div>
              {seg.content}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function TerminalBlock({ seg }: { seg: Extract<Segment, { kind: "terminal" }> }) {
  const [open, setOpen] = useState(false);
  const color = seg.status === "error" ? "#ff7875" : seg.status === "running" ? "#e8e8ea" : "#73d13d";
  const statusText = seg.status === "running" ? "执行中" : seg.status === "error" ? "失败" : `完成${seg.ms !== undefined ? ` · ${seg.ms}ms` : ""}`;
  return (
    <div style={{ margin: "6px 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
      <div style={{ ...headStyle, fontFamily: "inherit" }} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span style={{ color: "#6a6acd" }}>⌁</span>
        <span style={{ color: "#c8c8cd" }}>{seg.tool}</span>
        <span style={{ fontSize: 11, color }}>● {statusText}</span>
        {!open && <span style={{ fontSize: 11, color: "#55555c", marginLeft: "auto" }}>{seg.lines.length} 行</span>}
      </div>
      {open && (
        <div
          style={{
            marginTop: 4, padding: "8px 10px", background: "#0a0a0c", border: "1px solid #1f1f23", borderRadius: 6,
            fontSize: 11, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}
        >
          {seg.lines.map((l, i) => (
            <div key={i} style={{ color: l.startsWith("!") ? "#ff7875" : l.startsWith("$") ? "#6a6acd" : l.startsWith("·") || l.startsWith("✓") ? "#73d13d" : "#9a9aa0" }}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SunoProgressBlock({ seg }: { seg: Extract<Segment, { kind: "suno" }> }) {
  const pct = seg.total ? Math.round((seg.done / seg.total) * 100) : 10;
  const sec = Math.round(seg.elapsedMs / 1000);
  return (
    <div style={{ margin: "6px 0", padding: "8px 10px", background: "#141417", border: "1px solid #2a2a2e", borderRadius: 6 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
        <span>🎛 suno-subagent</span>
        <Tag color={seg.status === "complete" ? "green" : seg.status === "error" ? "red" : "processing"} style={{ marginInlineEnd: 0 }}>
          {seg.status === "complete" ? "生成完成" : seg.status === "error" ? "生成失败" : "生成中"}
        </Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {seg.done}/{seg.total} 就绪 · {sec}s{seg.note ? ` · ${seg.note}` : ""}
        </Text>
      </div>
      <Progress
        percent={pct}
        size="small"
        status={seg.status === "error" ? "exception" : seg.status === "complete" ? "success" : "active"}
        showInfo={false}
        strokeColor="#6a6acd"
        style={{ margin: 0 }}
      />
    </div>
  );
}

function friendlyCategory(raw: string): { kind: string; title: string; tips: string[] } {
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network|LLM/i.test(raw))
    return { kind: "llm", title: "LLM 端点问题", tips: ["检查「LLM 设置」端点/Key/Model", "本地端点示例 http://localhost:11434/v1"] };
  if (/CAPTCHA/i.test(raw))
    return { kind: "captcha", title: "Suno 风控验证", tips: ["浏览器打开 suno.com/create 人工过一次验证后重试", "或更换 SUNO_COOKIES（|| 分隔多账号）"] };
  if (/配额|quota/i.test(raw)) return { kind: "quota", title: "Suno 配额不足", tips: ["检查 credits 余量或更换账号"] };
  if (/cookie|401|429|unauthorized|expired/i.test(raw))
    return { kind: "cookie", title: "Suno 会话失效", tips: ["重新导出 suno.com Cookie 填入 .env.local 后重启"] };
  return { kind: "generic", title: "任务执行失败", tips: ["稍后重试；持续失败展开下方调试详情"] };
}

export function ErrorCard({ seg }: { seg: Extract<Segment, { kind: "error" }> }) {
  const [debugOpen, setDebugOpen] = useState(false);
  const fb = seg.category === "unknown" ? friendlyCategory(seg.raw) : null;
  const headline = fb ? fb.title : seg.headline;
  const steps = fb ? fb.tips : seg.steps;
  return (
    <Card
      size="small"
      style={{ marginTop: 8, background: "#1a1214", borderColor: "#5c2a31" }}
      title={<span style={{ fontSize: 12, color: "#ff7875" }}>⚠ {headline}{seg.reviewStreaming ? " · LLM 评审中…" : ""}</span>}
    >
      {seg.reviewStreaming && seg.reviewText && (
        <div style={{ fontSize: 11, color: "#9a9aa0", whiteSpace: "pre-wrap", marginBottom: 6 }}>{seg.reviewText}▌</div>
      )}
      <ul style={{ margin: "0 0 6px", paddingLeft: 18, fontSize: 12 }}>
        {steps.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
      {seg.category === "llm" && <Link href="/settings"><span style={{ color: "#6a6acd", fontSize: 12 }}>打开 LLM 设置 ↗</span></Link>}
      {seg.resolvableByCli && seg.cliSuggestion && (
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ flex: 1, background: "#0a0a0c", padding: "6px 8px", borderRadius: 4, fontSize: 11, color: "#73d13d", wordBreak: "break-all" }}>{seg.cliSuggestion}</code>
          <button
            style={{ background: "#1f1f24", color: "#b8b8bd", fontSize: 11, border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}
            onClick={() => navigator.clipboard?.writeText(seg.cliSuggestion ?? "")}
          >
            复制
          </button>
        </div>
      )}
      <div style={{ marginTop: 6 }}>
        <span style={{ fontSize: 11, color: "#55555c", cursor: "pointer" }} onClick={() => setDebugOpen(!debugOpen)}>
          <Chevron open={debugOpen} /> 调试详情
        </span>
        {debugOpen && (
          <pre style={{ marginTop: 4, fontSize: 10, color: "#7c7c85", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#0a0a0c", padding: 8, borderRadius: 4, maxHeight: 160, overflow: "auto" }}>
            {seg.raw}
          </pre>
        )}
      </div>
    </Card>
  );
}

export function PlanCard({ plan }: { plan: Record<string, unknown> }) {
  return (
    <Card size="small" style={{ marginTop: 6, background: "#141417", borderColor: "#2a2a2e" }}
      title={<Text style={{ fontSize: 12 }}>创作计划 JSON</Text>}>
      <pre style={{ margin: 0, fontSize: 11, color: "#9ecbff", overflow: "auto", maxHeight: 200 }}>{JSON.stringify(plan, null, 2)}</pre>
    </Card>
  );
}

export function JudgeCard({ report }: { report: Record<string, unknown> }) {
  const r = report as unknown as {
    score: number; verdict: string; retried: number; comment?: string;
    perDimension?: Record<string, number>;
    rules?: { name: string; passed: boolean; blocking?: boolean; note?: string }[];
  };
  return (
    <Card size="small" style={{ marginTop: 6, background: "#141417", borderColor: "#2a2a2e" }}
      title={<Text style={{ fontSize: 12 }}>效果评判 · {r.score} 分（{r.verdict === "pass" ? "通过" : "重派"}，已重派 {r.retried} 次）</Text>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(r.perDimension ?? {}).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Text style={{ width: 70, fontSize: 12, color: "#b8b8bd" }}>{k}</Text>
            <div style={{ flex: 1, background: "#1d1d22", height: 6, borderRadius: 3 }}>
              <div style={{ width: `${(v / 5) * 100}%`, background: "#6a6acd", height: 6, borderRadius: 3 }} />
            </div>
            <Text style={{ fontSize: 12, width: 26, textAlign: "right" }}>{v}</Text>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        {(r.rules ?? []).map((x) => (
          <Tag key={x.name} color={x.passed ? "green" : x.blocking === false ? "orange" : "red"} style={{ fontSize: 11, margin: 3 }}>
            {x.passed ? "✓" : "✗"} {x.name}{x.blocking === false ? "（软）" : ""}
          </Tag>
        ))}
      </div>
    </Card>
  );
}

export function ResultBlock({ seg, onOpenBoard }: { seg: Extract<Segment, { kind: "result" }>; onOpenBoard: () => void }) {
  return (
    <Card size="small" style={{ marginTop: 6, background: "#141417", borderColor: "#2a2a2e" }}
      title={<Text style={{ fontSize: 12 }}>交付 · {seg.song.title}（{seg.song.durationSec}s · {seg.song.sourceFormat}）</Text>}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button style={{ padding: "5px 14px", border: "none", borderRadius: 8, background: "#6a6acd", color: "#fff", cursor: "pointer", fontSize: 12 }} onClick={onOpenBoard}>
          查看作品看板 →
        </button>
        <a href={seg.song.audioUrl} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 12 }}>↗ 源链接</a>
        <Text type="secondary" style={{ fontSize: 11 }}>已解密转码——看板内直接播放</Text>
      </div>
    </Card>
  );
}

export function SegmentView({ seg, onOpenBoard }: { seg: Segment; onOpenBoard: () => void }) {
  switch (seg.kind) {
    case "text":
      return <div style={{ fontSize: 13, color: "#e8e8ea", margin: "3px 0", whiteSpace: "pre-wrap" }}>{seg.text}</div>;
    case "thinking":
      return <ThinkingBlock seg={seg} />;
    case "terminal":
      return <TerminalBlock seg={seg} />;
    case "suno":
      return <SunoProgressBlock seg={seg} />;
    case "plan":
      return <PlanCard plan={seg.plan} />;
    case "judge":
      return <JudgeCard report={seg.report as Record<string, unknown>} />;
    case "result":
      return <ResultBlock seg={seg} onOpenBoard={onOpenBoard} />;
    case "error":
      return <ErrorCard seg={seg} />;
  }
}
