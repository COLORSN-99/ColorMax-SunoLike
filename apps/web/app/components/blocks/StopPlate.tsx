"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Chevron } from "./shared";

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
