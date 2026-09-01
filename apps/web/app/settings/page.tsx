"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Select, AutoComplete, InputNumber, Switch, Tag, Alert, Spin } from "antd";
import { PROVIDERS, providerBase, type ProviderPreset } from "@colormax/llm/providers";

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

const ACCESS_GROUP: Record<ProviderPreset["access"], string> = {
  domestic: "国内可直连",
  proxy: "需代理 / 科学上网",
  local: "本地（离线/零成本）",
};

/** 按 access 分组供下拉 optgroup（自定义项永远排最后） */
const groupedProviders = () => {
  const order: ProviderPreset["access"][] = ["domestic", "proxy", "local"];
  const groups = order.map((a) => ({
    label: ACCESS_GROUP[a],
    options: PROVIDERS.filter((p) => p.access === a && p.id !== "custom").map((p) => ({ label: p.label, value: p.id })),
  })).filter((g) => g.options.length);
  const custom = PROVIDERS.find((p) => p.id === "custom");
  if (custom) groups.push({ label: "自定义", options: [{ label: custom.label, value: custom.id }] });
  return groups;
};

export default function Settings() {
  const [form, setForm] = useState<FormState>({
    provider: "", baseURL: "", apiKey: "", model: "",
    apiFormat: "openai", temperature: 0.8, maxTokens: 4096, thinking: false,
  });
  const [pid, setPid] = useState("custom");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const preset = useMemo(() => PROVIDERS.find((p) => p.id === pid) ?? PROVIDERS[PROVIDERS.length - 1], [pid]);
  const supportsAnthropic = Boolean(preset.anthropicBase);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((s) => {
      setForm({
        provider: s.provider ?? "", baseURL: s.baseURL ?? "", apiKey: s.apiKey ?? "",
        model: s.model ?? "", apiFormat: s.apiFormat ?? "openai",
        temperature: Number(s.temperature ?? 0.8), maxTokens: Number(s.maxTokens ?? 4096), thinking: Boolean(s.thinking),
      });
      // 反推当前服务商（按 openaiBase/anthropicBase 匹配），匹配不到=自定义
      const hit = PROVIDERS.find((p) => p.openaiBase === s.baseURL || p.anthropicBase === s.baseURL);
      setPid(hit?.id ?? "custom");
    });
  }, []);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const applyProvider = (id: string) => {
    const p = PROVIDERS.find((x) => x.id === id);
    setPid(id);
    if (!p || p.id === "custom") return; // 自定义：保持现有字段不动
    const fmt = p.defaultFormat;
    setForm((f) => ({
      ...f,
      provider: p.label.replace(/\s*·.*$/, "").replace(/（.*）/, ""),
      apiFormat: fmt,
      baseURL: providerBase(p, fmt),
      model: p.defaultModel,
      maxTokens: p.defaultMaxTokens,
    }));
  };

  const changeFormat = (fmt: ApiFormat) => {
    set("apiFormat", fmt);
    if (preset.id === "custom") return;
    if (fmt === "anthropic" && !preset.anthropicBase) {
      setMsg({ kind: "err", text: `${preset.label} 未预置 Anthropic 端点——保持 OpenAI 兼容或改用自定义 BaseURL` });
      return;
    }
    set("baseURL", providerBase(preset, fmt));
  };

  const save = async () => {
    setMsg(null);
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
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

  const linkRow = (url?: string, label?: string) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 11, marginRight: 12 }}>{label} ↗</a>
    ) : null;

  const row = (label: React.ReactNode, control: React.ReactNode, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "#9a9aa0", marginBottom: 4 }}>{label}</div>
      {control}
      {extra && <div style={{ fontSize: 11, color: "#6f6f76", marginTop: 3 }}>{extra}</div>}
    </div>
  );

  const inputStyle: React.CSSProperties = { width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" };

  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: "#0d0d0f", colorBgContainer: "#161618", colorBorder: "#2a2a2e", colorText: "#e8e8ea", fontSize: 13 } }}>
      <main style={{ maxWidth: 680, margin: "0 auto", padding: 28 }}>
        <h1 style={{ fontSize: 20 }}>LLM 接入设置 <Tag>多服务商</Tag>{" "}
          <Link href="/"><span style={{ color: "#6a6acd" }}>返回创作室</span></Link>
        </h1>
        <p style={{ fontSize: 12, color: "#9a9aa0" }}>
          选择服务商自动填充 BaseURL / API 格式 / 推荐模型；各家版本前缀差异（智谱 /api/paas/v4、阿里 /compatible-mode/v1、
          DeepSeek Anthropic /anthropic/v1）已内联，无需手改。也可切「自定义」填任意 OpenAI/Anthropic 兼容端点（仅真实 Key，无 mock）。
        </p>
        <div style={{ background: "#141417", border: "1px solid #2a2a2e", borderRadius: 10, padding: 16, marginTop: 12 }}>
          {row(
            "服务商",
            <Select style={{ width: "100%" }} value={pid} options={groupedProviders()} onChange={applyProvider} />,
            preset.access === "proxy" && (
              <span style={{ color: "#e8b86a" }}>⚠ 该服务商需代理/科学上网，国内 IP 直连会被拒</span>
            ),
          )}
          {row(
            "API 格式",
            <Select
              style={{ width: "100%" }} value={form.apiFormat}
              options={[
                { label: "OpenAI 兼容（/chat/completions）", value: "openai" },
                { label: supportsAnthropic ? "Anthropic Message 兼容（/messages）" : "Anthropic Message 兼容（该服务商未预置）", value: "anthropic", disabled: pid !== "custom" && !supportsAnthropic },
              ]}
              onChange={changeFormat}
            />,
          )}
          {row(
            "BaseURL",
            <input style={inputStyle} value={form.baseURL} placeholder="https://api.openai.com/v1" onChange={(e) => set("baseURL", e.target.value)} />,
            <span>{linkRow(preset.docsUrl, "接入文档")}{linkRow(preset.consoleUrl, "获取 API Key")}{linkRow(preset.balanceUrl, "查看余额 / 充值")}{preset.note}</span>,
          )}
          {row(
            "API Key",
            <input type="password" style={inputStyle} value={form.apiKey} placeholder="sk-…" onChange={(e) => set("apiKey", e.target.value)} />,
            "写入 .env.local（不入库；本地/自托管端点可留空）",
          )}
          {row(
            "模型名称",
            <AutoComplete
              style={{ width: "100%" }} value={form.model}
              options={preset.models.map((m) => ({ label: `${m.label}${m.reasoning ? " · 推理" : ""}`, value: m.id }))}
              onChange={(v) => set("model", v)}
              placeholder={preset.defaultModel || "自定义模型名"}
              filterOption={(input, option) => (option?.value ?? "").toLowerCase().includes(input.toLowerCase())}
            />,
            preset.models.length ? preset.models.map((m) => m.id).join(" / ") : "自由填写（Ollama = 你 pull 的模型名）",
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {row("供应商名称", <input style={{ ...inputStyle, width: 160 }} value={form.provider} placeholder="DeepSeek" onChange={(e) => set("provider", e.target.value)} />)}
            {row("Max Tokens", <InputNumber min={1} max={32768} value={form.maxTokens} onChange={(v) => set("maxTokens", Number(v ?? 4096))} />)}
            {row("Temperature", <InputNumber min={0} max={2} step={0.1} value={form.temperature} onChange={(v) => set("temperature", Number(v ?? 0.8))} />)}
            {row("思考模式", <Switch checked={form.thinking} onChange={(v) => set("thinking", v)} />, "透传 reasoning/思考链")
            }
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#1d1d1f", color: "#fff", cursor: "pointer" }} onClick={save}>保存</button>
            <button style={{ padding: "8px 16px", border: "1px solid #2a2a2e", borderRadius: 8, background: "#141417", color: "#b8b8bd", cursor: "pointer" }} onClick={test} disabled={testing}>
              {testing ? <Spin size="small" style={{ marginRight: 6 }} /> : null}测试连接
            </button>
          </div>
          {msg && <Alert style={{ marginTop: 10 }} type={msg.kind === "ok" ? "success" : "error"} showIcon message={msg.text} />}
        </div>
      </main>
    </ConfigProvider>
  );
}
