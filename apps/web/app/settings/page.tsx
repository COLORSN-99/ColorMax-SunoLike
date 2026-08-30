"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Select, InputNumber, Switch, Tag, Alert, Spin } from "antd";

type ApiFormat = "openai" | "anthropic";

interface FormState {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  apiFormat: ApiFormat;
  temperature: number;
  maxTokens: number;
  thinking: boolean;
}

const PRESETS: { label: string; value: Partial<FormState> }[] = [
  { label: "DeepSeek（OpenAI 兼容）", value: { provider: "DeepSeek", baseURL: "https://api.deepseek.com", model: "deepseek-v4-flash", apiFormat: "openai", maxTokens: 4096 } },
  { label: "DeepSeek（Anthropic 端点）", value: { provider: "DeepSeek", baseURL: "https://api.deepseek.com/anthropic", apiFormat: "anthropic", maxTokens: 4096 } },
  { label: "Ollama/LM Studio（本地）", value: { provider: "Ollama", baseURL: "http://localhost:11434/v1", model: "qwen2.5", apiFormat: "openai", maxTokens: 2048 } },
];

export default function Settings() {
  const [form, setForm] = useState<FormState>({
    provider: "",
    baseURL: "",
    apiKey: "",
    model: "",
    apiFormat: "openai",
    temperature: 0.8,
    maxTokens: 4096,
    thinking: false,
  });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setForm({
          provider: s.provider ?? "",
          baseURL: s.baseURL ?? "",
          apiKey: s.apiKey ?? "",
          model: s.model ?? "",
          apiFormat: s.apiFormat ?? "openai",
          temperature: Number(s.temperature ?? 0.8),
          maxTokens: Number(s.maxTokens ?? 4096),
          thinking: Boolean(s.thinking),
        }),
      );
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) setMsg({ kind: "err", text: `保存失败：${data.error ?? res.status}` });
    else setMsg({ kind: "ok", text: "保存成功（API 侧即时生效；Next 重启后环境变量刷新）" });
  };

  const test = async () => {
    setTesting(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const d = await res.json();
      if (d.ok) setMsg({ kind: "ok", text: `连接成功（${d.latencyMs}ms）` });
      else setMsg({ kind: "err", text: `连接失败：${d.error ?? "未知错误"}` });
    } finally {
      setTesting(false);
    }
  };

  const applyPreset = (label: string) => {
    const p = PRESETS.find((x) => x.label === label)?.value;
    if (p) setForm((f) => ({ ...f, ...p }));
  };

  const row = (label: React.ReactNode, control: React.ReactNode, extra?: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9a9aa0", marginBottom: 4 }}>{label}</div>
      {control}
      {extra && <div style={{ fontSize: 11, color: "#6f6f76", marginTop: 3 }}>{extra}</div>}
    </div>
  );

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: "#0d0d0f", colorBgContainer: "#161618", colorBorder: "#2a2a2e", colorText: "#e8e8ea", fontSize: 13 } }}>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: 28 }}>
        <h1 style={{ fontSize: 20 }}>LLM 接入设置 <Tag>DeepSeek 字段集</Tag>{" "}
          <Link href="/"><span style={{ color: "#6a6acd" }}>返回创作室</span></Link>
        </h1>
        <p style={{ fontSize: 12, color: "#9a9aa0" }}>
          参考 <a href="https://api-docs.deepseek.com/zh-cn/" target="_blank" rel="noreferrer" style={{ color: "#6a6acd" }}>DeepSeek 官方接入文档</a>：
          OpenAI 兼容 base_url = <code>https://api.deepseek.com</code>；Anthropic 兼容 base_url = <code>https://api.deepseek.com/anthropic</code>；
          其他 OpenAI/Anthropic 兼容供应商同样适用（仅真实 API Key，无 mock 分支）。
        </p>
        <div style={{ background: "#141417", border: "1px solid #2a2a2e", borderRadius: 10, padding: 16, marginTop: 12 }}>
          {row(
            "供应商预设",
            <Select
              style={{ width: "100%" }}
              placeholder="选择预设（自动填充字段）"
              options={PRESETS.map((p) => ({ label: p.label, value: p.label }))}
              onChange={applyPreset}
            />,
            "也可完全手动填写",
          )}
          {row(
            "供应商名称",
            <input style={{ width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" }}
              value={form.provider} placeholder="DeepSeek" onChange={(e) => set("provider", e.target.value)} />,
          )}
          {row(
            "API 格式",
            <Select
              style={{ width: "100%" }}
              value={form.apiFormat}
              options={[
                { label: "OpenAI 兼容（/chat/completions）", value: "openai" },
                { label: "Anthropic Message 兼容（/messages）", value: "anthropic" },
              ]}
              onChange={(v) => {
                set("apiFormat", v as ApiFormat);
                if (!form.baseURL) return;
                // 格式切换联动官方端点 hint（不覆盖用户手动 URL）
                if (v === "anthropic" && form.baseURL === "https://api.deepseek.com") set("baseURL", "https://api.deepseek.com/anthropic");
                if (v === "openai" && form.baseURL === "https://api.deepseek.com/anthropic") set("baseURL", "https://api.deepseek.com");
              }}
            />,
          )}
          {row(
            "BaseURL",
            <input style={{ width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" }}
              value={form.baseURL} placeholder="https://api.deepseek.com" onChange={(e) => set("baseURL", e.target.value)} />,
          )}
          {row(
            "API Key",
            <input type="password" style={{ width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" }}
              value={form.apiKey} placeholder="sk-…" onChange={(e) => set("apiKey", e.target.value)} />,
            "写入 .env.local（不入库；本地端点可留空）",
          )}
          {row(
            "模型名称",
            <input style={{ width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" }}
              value={form.model} placeholder="deepseek-v4-flash / deepseek-v4-pro" onChange={(e) => set("model", e.target.value)} />,
            "DeepSeek：deepseek-v4-flash / deepseek-v4-pro / deepseek-v4-flash-vision-exp",
          )}
          <div style={{ display: "flex", gap: 16 }}>
            {row(
              "Max Tokens",
              <InputNumber min={1} max={32768} value={form.maxTokens} onChange={(v) => set("maxTokens", Number(v ?? 4096))} />,
              "DeepSeek 默认 4096",
            )}
            {row(
              "Temperature",
              <InputNumber min={0} max={2} step={0.1} value={form.temperature} onChange={(v) => set("temperature", Number(v ?? 0.8))} />,
            )}
            {row("思考模式 (thinking)", <Switch checked={form.thinking} onChange={(v) => set("thinking", v)} />, "DeepSeek V4 reasoning 参数")}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#1d1d1f", color: "#fff", cursor: "pointer" }} onClick={save}>
              保存
            </button>
            <button style={{ padding: "8px 16px", border: "1px solid #2a2a2e", borderRadius: 8, background: "#141417", color: "#b8b8bd", cursor: "pointer" }} onClick={test} disabled={testing}>
              {testing ? <Spin size="small" style={{ marginRight: 6 }} /> : null}测试连接
            </button>
          </div>
          {msg && (
            <Alert style={{ marginTop: 10 }} type={msg.kind === "ok" ? "success" : "error"} showIcon message={msg.text} />
          )}
        </div>
      </main>
    </ConfigProvider>
  );
}
