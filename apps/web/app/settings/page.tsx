"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConfigProvider, theme, Select, AutoComplete, InputNumber, Switch, Tag, Alert, Spin, Popconfirm } from "antd";
import { PROVIDERS, providerBase, type ProviderPreset } from "@colormax/llm/providers";
import { customProfileId, profileFor, type ProfileView, type SettingsView } from "@/lib/settings-profiles";

type ApiFormat = "openai" | "anthropic";
interface FormState { providerId: string; provider: string; baseURL: string; model: string; apiFormat: ApiFormat; temperature: number; maxTokens: number; thinking: boolean; }

const ACCESS_GROUP: Record<ProviderPreset["access"], string> = { domestic: "国内可直连", proxy: "需代理 / 科学上网", local: "本地（离线/零成本）" };
const groups = () => ["domestic", "proxy", "local"].map((access) => ({
  label: ACCESS_GROUP[access as ProviderPreset["access"]], options: PROVIDERS.filter((p) => p.access === access && p.id !== "custom").map((p) => ({ label: p.label, value: p.id })),
})).filter((x) => x.options.length).concat([{ label: "自定义", options: [{ label: "自定义（OpenAI/Anthropic 兼容）", value: "custom" }] }]);
const formOf = (p: ProfileView): FormState => ({ providerId: p.providerId, provider: p.provider, baseURL: p.baseURL, model: p.model, apiFormat: p.apiFormat, temperature: p.temperature, maxTokens: p.maxTokens, thinking: p.thinking });

export default function Settings() {
  const [form, setForm] = useState<FormState>({ providerId: "custom", provider: "", baseURL: "", model: "", apiFormat: "openai", temperature: .8, maxTokens: 4096, thinking: false });
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [activeId, setActiveId] = useState("");
  /** 仅候选替换 Key；历史 raw Key 永不进入浏览器 state。 */
  const [replacementKey, setReplacementKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const profileId = form.providerId === "custom" ? customProfileId(form.baseURL) : form.providerId;
  const history = profileFor(profiles, profileId);
  const preset = useMemo(() => PROVIDERS.find((p) => p.id === form.providerId) ?? PROVIDERS[PROVIDERS.length - 1], [form.providerId]);
  const supportsAnthropic = Boolean(preset.anthropicBase);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((view: SettingsView) => { setProfiles(view.profiles); setActiveId(view.activeProfileId); setForm(formOf(view.active)); }); }, []);
  useEffect(() => { setReplacementKey(""); setClearKey(false); }, [profileId]);

  const applyProvider = (id: string) => {
    const p = PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    if (id === "custom") { set("providerId", "custom"); return; }
    const saved = profileFor(profiles, id);
    if (saved) { setForm(formOf(saved)); return; }
    const fmt = p.defaultFormat;
    setForm((f) => ({ ...f, providerId: id, provider: p.label.replace(/\s*·.*$/, "").replace(/（.*）/, ""), apiFormat: fmt, baseURL: providerBase(p, fmt), model: p.defaultModel, maxTokens: p.defaultMaxTokens }));
  };

  const changeFormat = (fmt: ApiFormat) => {
    if (form.providerId !== "custom" && fmt === "anthropic" && !supportsAnthropic) return;
    set("apiFormat", fmt);
    if (form.providerId !== "custom") set("baseURL", providerBase(preset, fmt));
  };

  const save = async () => {
    setMsg(null);
    const body: Record<string, unknown> = { ...form, profileId, ...(replacementKey ? { apiKey: replacementKey } : {}), ...(clearKey ? { apiKey: "", clearApiKey: true } : {}) };
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) return setMsg({ kind: "err", text: `保存失败：${d.error ?? res.status}` });
    const view = d.settings as SettingsView;
    setProfiles(view.profiles); setActiveId(view.activeProfileId); setForm(formOf(view.active)); setReplacementKey(""); setClearKey(false);
    setMsg({ kind: "ok", text: "已保存并激活当前服务商档案。新任务 / 接续任务将使用该服务商的服务端 API Key。" });
  };
  const test = async () => { setTesting(true); setMsg(null); try { const r = await fetch("/api/settings/test", { method: "POST" }); const d = await r.json(); setMsg(d.ok ? { kind: "ok", text: `连接成功（${d.latencyMs}ms）` } : { kind: "err", text: `连接失败：${d.error ?? "未知错误"}` }); } finally { setTesting(false); } };
  const row = (label: string, control: React.ReactNode, extra?: React.ReactNode) => <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: "#9a9aa0", marginBottom: 4 }}>{label}</div>{control}{extra && <div style={{ fontSize: 11, color: "#6f6f76", marginTop: 3 }}>{extra}</div>}</div>;
  const input: React.CSSProperties = { width: "100%", padding: 8, background: "#0f0f11", border: "1px solid #2a2a2e", borderRadius: 6, color: "#e8e8ea" };
  const link = (url: string | undefined, label: string) => url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: "#6a6acd", fontSize: 11, marginRight: 12 }}>{label} ↗</a> : null;

  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorBgBase: "#0d0d0f", colorBgContainer: "#161618", colorBorder: "#2a2a2e", colorText: "#e8e8ea", fontSize: 13 } }}><main style={{ maxWidth: 680, margin: "0 auto", padding: 28 }}>
    <h1 style={{ fontSize: 20 }}>LLM 接入设置 <Tag>服务商档案</Tag> <Link href="/"><span style={{ color: "#6a6acd" }}>返回创作室</span></Link></h1>
    <p style={{ fontSize: 12, color: "#9a9aa0" }}>每个服务商独立保存配置与 API Key；浏览器只收到脱敏状态，raw Key 仅保留在本机 `.env.local` 并在服务端注入 LangGraph。自定义端点按 BaseURL 分桶。</p>
    <div style={{ background: "#141417", border: "1px solid #2a2a2e", borderRadius: 10, padding: 16 }}>
      {row("服务商", <Select style={{ width: "100%" }} value={form.providerId} options={groups()} onChange={applyProvider} />, preset.access === "proxy" ? <span style={{ color: "#e8b86a" }}>⚠ 该服务商需要代理/科学上网</span> : undefined)}
      {row("API 格式", <Select style={{ width: "100%" }} value={form.apiFormat} options={[{ label: "OpenAI 兼容（/chat/completions）", value: "openai" }, { label: "Anthropic Messages（/messages）", value: "anthropic", disabled: form.providerId !== "custom" && !supportsAnthropic }]} onChange={changeFormat} />)}
      {row("BaseURL", <input style={input} value={form.baseURL} placeholder="https://api.openai.com/v1" onChange={(e) => set("baseURL", e.target.value)} />, <>{link(preset.docsUrl, "接入文档")}{link(preset.consoleUrl, "获取 API Key")}{link(preset.balanceUrl, "查看余额 / 充值")}{preset.note}</>)}
      {row("API Key", <><input type="password" style={input} value={replacementKey} placeholder={clearKey ? "将清除该服务商的 Key" : history?.hasApiKey ? `已保存：${history.apiKeyMasked}（输入新 Key 才替换）` : "尚未保存此服务商的 API Key"} onChange={(e) => { setReplacementKey(e.target.value); setClearKey(false); }} />{history?.hasApiKey && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}><Tag color="green">已保存 · {history.apiKeyMasked}</Tag><Popconfirm title="清除该服务商保存的 API Key？" description="不会影响其他服务商的 Key。" okText="清除" cancelText="取消" onConfirm={() => { setReplacementKey(""); setClearKey(true); }}><button style={{ fontSize: 11, border: "none", background: "transparent", color: "#ff7875", cursor: "pointer" }}>清除该 Key</button></Popconfirm></div>}</>, "Key 只在保存时发送；省略输入将保留此服务商历史 Key，不会把脱敏值写回。")}
      {row("模型名称", <AutoComplete style={{ width: "100%" }} value={form.model} options={preset.models.map((m) => ({ label: `${m.label}${m.reasoning ? " · 推理" : ""}`, value: m.id }))} onChange={(v) => set("model", v)} placeholder={preset.defaultModel || "自定义模型名"} />)}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {row("供应商名称", <input style={{ ...input, width: 160 }} value={form.provider} onChange={(e) => set("provider", e.target.value)} />)}
        {row("Max Tokens", <InputNumber min={1} max={32768} value={form.maxTokens} onChange={(v) => set("maxTokens", Number(v ?? 4096))} />)}
        {row("Temperature", <InputNumber min={0} max={2} step={.1} value={form.temperature} onChange={(v) => set("temperature", Number(v ?? .8))} />)}
        {row("思考模式", <Switch checked={form.thinking} onChange={(v) => set("thinking", v)} />, "透传 reasoning/思考链")}
      </div>
      <div style={{ display: "flex", gap: 10 }}><button style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: "#1d1d1f", color: "#fff", cursor: "pointer" }} onClick={save}>保存并激活</button><button style={{ padding: "8px 16px", border: "1px solid #2a2a2e", borderRadius: 8, background: "#141417", color: "#b8b8bd", cursor: "pointer" }} onClick={test} disabled={testing}>{testing && <Spin size="small" style={{ marginRight: 6 }} />}测试当前激活连接</button>{activeId === profileId && <Tag color="blue">当前激活</Tag>}</div>
      {msg && <Alert style={{ marginTop: 10 }} type={msg.kind === "ok" ? "success" : "error"} showIcon message={msg.text} />}
    </div>
  </main></ConfigProvider>;
}
