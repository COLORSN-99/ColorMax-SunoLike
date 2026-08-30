"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Layout, Card, Tag, List, Typography, Steps, Alert } from "antd";
import { Bubble, Sender, Conversations, Welcome } from "@ant-design/x";
import { SERVICE_MARKET, PLUGIN_MARKET } from "./data/market";

const { Sider, Content } = Layout;
const { Text } = Typography;

const PHASES = ["intent", "plan", "dispatch", "suno", "align", "judge", "deliver"] as const;
const PHASE_LABEL: Record<string, string> = {
  intent: "意图分析", plan: "创作规划", dispatch: "派发", suno: "Suno 出歌",
  align: "对齐建模", judge: "效果评判", deliver: "交付",
};

interface JudgeReport {
  score: number;
  perDimension: Record<string, number>;
  rules: { name: string; passed: boolean }[];
  retried: number;
  verdict: string;
}
interface SongResult {
  title: string;
  audioUrl: string;
  durationSec: number;
  sourceFormat: string;
}
interface AlignedResult {
  song: SongResult;
}

interface FriendlyErr {
  kind: "llm" | "cookie" | "quota" | "generic";
  title: string;
  tips: string[];
}

function friendlyError(msg: string): FriendlyErr {
  if (/fetch failed|ECONNREFUSED|ETIMEDOUT|network/i.test(msg))
    return { kind: "llm", title: "LLM 端点不可达", tips: ["请到「LLM 设置」页配置可用的 OpenAI 兼容端点（Base URL / Model / Key）", "本地端点示例：http://localhost:11434/v1（Ollama）"] };
  if (/CAPTCHA/i.test(msg))
    return { kind: "cookie", title: "Suno 风控验证（CAPTCHA）", tips: ["Suno 触发了人机验证：请在浏览器打开 suno.com/create 完成一次生成（人工过验证）", "或到 apps/web/.env.local 更换新的 SUNO_COOKIES（多账号可用 || 分隔）后重启服务", "短期高频生成会触发风控，建议间隔后再试"] };
  if (/配额|quota|SunoQuota/i.test(msg))
    return { kind: "quota", title: "Suno 配额不足", tips: ["到 Suno 账号检查剩余 credits（当前配额 2450/月）", "等待配额恢复或更换账号 cookie"] };
  return { kind: "generic", title: "任务执行失败", tips: ["查看服务端日志 /tmp/cm_web.log 定位原因", "重试（生成风控时建议间隔几分钟）"] };
}

function CodexShell({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorBgBase: "#0d0d0f",
          colorBgContainer: "#161618",
          colorBorder: "#2a2a2e",
          colorText: "#e8e8ea",
          borderRadius: 6,
          fontSize: 13,
        },
      }}
    >
      {children}
    </ConfigProvider>
  );
}

export default function Studio() {
  const [prompt, setPrompt] = useState("给妈妈写一首温暖的中文抒情歌");
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [planView, setPlanView] = useState<Record<string, unknown> | null>(null);
  const [report, setReport] = useState<JudgeReport | null>(null);
  const [result, setResult] = useState<AlignedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessions] = useState([
    { key: "s1", label: "给妈妈写一首温暖的中文抒情歌" },
    { key: "s2", label: "摇滚风格的毕业告别歌" },
  ]);
  const [active, setActive] = useState("s1");
  const [tab, setTab] = useState("studio");
  const logRef = useRef<HTMLDivElement>(null);
  const lines = useRef<string[]>([]);

  const run = async (input?: string) => {
    const p = (input ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true);
    setError(null);
    setPlanView(null);
    setReport(null);
    setResult(null);
    lines.current = [];
    setMsgs((m) => [...m, { role: "user", content: p }]);
    try {
      const created = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, sessionId: active }),
      });
      if (!created.ok) throw new Error(`创建任务失败 HTTP ${created.status}`);
      const { id } = (await created.json()) as { id: string };

      const res = await fetch(`/api/jobs/${id}/events`);
      if (!res.ok || !res.body) throw new Error(`事件流失败 HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = chunk.match(/event: (.+)/)?.[1];
          const data = chunk.match(/data: (.+)/)?.[1];
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (ev === "phase") {
            const ph = parsed.phase as string;
            const payload = parsed.payload;
            setPhase(ph);
            if (payload) {
              if (ph === "intent" && payload.theme) {
                lines.current.push(`意图分析：${payload.theme} · ${payload.mood} · ${payload.style} · ${payload.durationSec}s`);
              } else if (ph === "plan" && payload.title) {
                setPlanView(payload);
                lines.current.push(`创作规划：《${payload.title}》${payload.arrangement.key} 调·${payload.arrangement.bpm}bpm·${payload.structure.length} 段·seed=${payload.seed}`);
              } else if (ph === "suno" && payload.audioUrl) {
                lines.current.push(`出歌完成：${payload.durationSec}s（${payload.audioUrl}）`);
              } else if (ph === "judge" && payload.score !== undefined) {
                setReport(payload);
                lines.current.push(`评判：${payload.score} 分（${payload.verdict === "pass" ? "通过" : "重派"} · 已重派 ${payload.retried} 次）`);
              }
            }
          } else if (ev === "done") {
            setResult(parsed.result);
            if (parsed.report) setReport(parsed.report);
            lines.current.push("✓ 交付完成");
          } else if (ev === "failed") {
            throw new Error(parsed.error);
          }
          setMsgs((m) => {
            const last = m[m.length - 1];
            const content = lines.current.join("\n");
            if (last?.role === "assistant" && last.content === content) return m;
            return last?.role === "assistant"
              ? [...m.slice(0, -1), { role: "assistant", content }]
              : [...m, { role: "assistant", content }];
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const fe = friendlyError(msg);
      setError(fe.title);
      setMsgs((m) => [...m, { role: "assistant", content: `错误：${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = phase ? PHASES.indexOf((phase as (typeof PHASES)[number])) : 0;

  return (
    <CodexShell>
      <Layout style={{ height: "100vh", background: "#0d0d0f" }}>
        <Sider width={300} style={{ background: "#121214", borderRight: "1px solid #242428", overflow: "auto" }}>
          <div style={{ padding: "12px 12px 4px" }}>
            <Text strong style={{ color: "#9a9aa0", fontSize: 11, letterSpacing: ".8px" }}>
              应用服务 · APP MARKET
            </Text>
          </div>
          <List
            size="small"
            style={{ padding: "0 8px" }}
            dataSource={SERVICE_MARKET}
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
            <Text type="secondary" style={{ fontSize: 12 }}>Stage 2：LangGraph 编排 · 对齐评判</Text>
          </div>

          {phase && (
            <div style={{ padding: "12px 20px 0" }}>
              <Steps
                size="small"
                current={Math.max(0, stepIndex)}
                items={PHASES.map((ph) => ({ title: PHASE_LABEL[ph], description: phase === ph ? "执行中" : undefined }))}
              />
            </div>
          )}

          {tab === "board" ? (
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              <SongsBoard />
            </div>
          ) : (
          <div ref={logRef} style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {msgs.length === 0 ? (
              <Welcome
                icon={<span style={{ fontSize: 30 }}>🎵</span>}
                title="ColorMax 创作室"
                description="一句话，一首歌。多 Agent 联合编曲：意图分析 → 规划 → 派发 Sub-Agent 调 Suno → 对齐建模 → 效果评判 → 交付（当前引擎：Mock 调试链路）。"
              />
            ) : (
              <Bubble.List
                items={msgs.map((m, i) => ({
                  key: i,
                  placement: m.role === "user" ? "end" : "start",
                  role: m.role,
                  content: m.content,
                }))}
              />
            )}

            {error && (
        <Alert
          style={{ marginTop: 8 }}
          type="error"
          showIcon
          message={error}
          description={
            <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 12 }}>
              {friendlyError(error).tips.map((t, i) => (
                <li key={i}>
                  {t}{" "}
                  {friendlyError(error).kind === "llm" && (
                    <Link href="/settings"><span style={{ color: "#6a6acd" }}>打开 LLM 设置 ↗</span></Link>
                  )}
                </li>
              ))}
            </ul>
          }
        />
      )}

            {planView && (
              <Card size="small" style={{ marginTop: 12, background: "#141417", borderColor: "#2a2a2e" }}
                title={<Text style={{ fontSize: 12 }}>创作计划 JSON</Text>}>
                <pre style={{ margin: 0, fontSize: 12, color: "#9ecbff", overflow: "auto" }}>
                  {JSON.stringify(planView, null, 2)}
                </pre>
              </Card>
            )}

            {report && (
              <Card size="small" style={{ marginTop: 12, background: "#141417", borderColor: "#2a2a2e" }}
                title={<Text style={{ fontSize: 12 }}>效果评判报告 · {report.score} 分（{report.verdict === "pass" ? "通过" : "重派"}，已重派 {report.retried} 次）</Text>}>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {Object.entries(report.perDimension ?? {}).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Text style={{ width: 70, fontSize: 12, color: "#b8b8bd" }}>{k}</Text>
                      <div style={{ flex: 1, background: "#1d1d22", height: 6, borderRadius: 3 }}>
                        <div style={{ width: `${(v / 5) * 100}%`, background: "#6a6acd", height: 6, borderRadius: 3 }} />
                      </div>
                      <Text style={{ fontSize: 12, width: 26, textAlign: "right" }}>{v}</Text>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 8 }}>
                  {report.rules?.map((r) => (
                    <Tag key={r.name} color={r.passed ? "green" : "red"} style={{ fontSize: 11, margin: 4 }}>
                      {r.passed ? "✓" : "✗"} {r.name}
                    </Tag>
                  ))}
                </div>
              </Card>
            )}

            {result?.song && (
              <Card size="small" style={{ marginTop: 12, background: "#141417", borderColor: "#2a2a2e" }}
                title={<Text style={{ fontSize: 12 }}>交付 · {result.song.title}（{result.song.durationSec}s · {result.song.sourceFormat}）</Text>}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                  <button style={{ padding: "5px 14px", border: "none", borderRadius: 8, background: "#6a6acd", color: "#fff", cursor: "pointer", fontSize: 12 }} onClick={() => setTab("board")}>
                    查看作品看板 →
                  </button>
                  <a href={result.song.audioUrl} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 12 }}>
                    ↗ 源链接
                  </a>
                  <Text type="secondary" style={{ fontSize: 11 }}>已解密转码——作品看板内可直接播放/下载</Text>
                </div>
              </Card>
            )}
          </div>
          )}

          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #242428" }}>
            <Sender
              loading={busy}
              value={prompt}
              onChange={setPrompt}
              onSubmit={run}
              placeholder="描述你的创作想法…（Enter 发送）"
            />
          </div>
        </Content>
      </Layout>
    </CodexShell>
  );
}
