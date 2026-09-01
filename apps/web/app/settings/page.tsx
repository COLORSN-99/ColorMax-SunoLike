"use client";

/** RACK CONFIG · 机位设置 —— 服务商=机位卡；每机位独立配置 + API Key 历史（脱敏） */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Select, AutoComplete, Slider, Switch, Alert, Spin, Popconfirm, Tag } from "antd";
import { PROVIDERS, providerBase, type ProviderPreset } from "@colormax/llm/providers";
import { customProfileId, profileFor, type ProfileView, type SettingsView } from "@/lib/settings-profiles";

type ApiFormat = "openai" | "anthropic";
interface FormState { providerId: string; provider: string; baseURL: string; model: string; apiFormat: ApiFormat; temperature: number; maxTokens: number; thinking: boolean; }

const GROUP: Record<ProviderPreset["access"], string> = { domestic: "国内可直连", proxy: "需代理 / 科学上网", local: "本地离线" };
const groups = () => (["domestic", "proxy", "local"] as const)
  .map((a) => ({ label: GROUP[a], options: PROVIDERS.filter((p) => p.access === a && p.id !== "custom").map((p) => ({ label: p.label, value: p.id })) }))
  .filter((g) => g.options.length)
  .concat([{ label: "自定义", options: [{ label: "自定义（OpenAI/Anthropic 兼容）", value: "custom" }] }]);

const formOf = (p: ProfileView): FormState => ({
  providerId: p.providerId, provider: p.provider, baseURL: p.baseURL, model: p.model,
  apiFormat: p.apiFormat, temperature: p.temperature, maxTokens: p.maxTokens, thinking: p.thinking,
});

function RackPanel({ label, children, right }: { label: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="cm-panel" style={{ marginBottom: 12 }}>
      <div className="cm-panel__label">{label}{right && <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", textTransform: "none", letterSpacing: 0 }}>{right}</span>}</div>
      <div style={{ padding: 14 }}>{children}</div>
    </div>
  );
}

export default function Settings() {
  const [form, setForm] = useState<FormState>({ providerId: "custom", provider: "", baseURL: "", model: "", apiFormat: "openai", temperature: 0.8, maxTokens: 4096, thinking: false });
  const [profiles, setProfiles] = useState<ProfileView[]>([]);
  const [activeId, setActiveId] = useState("");
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
    setForm((f) => ({ ...f, providerId: id, provider: p.label.replace(/\s*·.*$/, "").replace(/（.*）/, ""), apiFormat: p.defaultFormat, baseURL: providerBase(p, p.defaultFormat), model: p.defaultModel, maxTokens: p.defaultMaxTokens }));
  };
  const changeFormat = (fmt: ApiFormat) => {
    if (form.providerId !== "custom" && fmt === "anthropic" && !supportsAnthropic) return;
    set("apiFormat", fmt);
    if (form.providerId !== "custom") set("baseURL", providerBase(preset, fmt));
  };
  const save = async () => {
    setMsg(null);
    const body = { ...form, profileId, ...(replacementKey ? { apiKey: replacementKey } : {}), ...(clearKey ? { apiKey: "", clearApiKey: true } : {}) };
    const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok) return setMsg({ kind: "err", text: `保存失败：${d.error ?? res.status}` });
    const view = d.settings as SettingsView;
    setProfiles(view.profiles); setActiveId(view.activeProfileId); setForm(formOf(view.active));
    setReplacementKey(""); setClearKey(false);
    setMsg({ kind: "ok", text: "机位已通电激活 —— 新任务与接续任务的 LLM 调用都走这台。" });
  };
  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const r = await fetch("/api/settings/test", { method: "POST" });
      const d = await r.json();
      setMsg(d.ok ? { kind: "ok", text: `信号正常（${d.latencyMs}ms）` } : { kind: "err", text: `无信号：${d.error ?? "未知错误"}` });
    } finally { setTesting(false); }
  };

  const input: React.CSSProperties = { width: "100%", padding: "8px 10px", background: "#120e0b", border: "1px solid #3d312a", borderRadius: 6, color: "#f6f0e8", fontFamily: "var(--cm-ui)", fontSize: 13 };
  const field = (label: string, control: React.ReactNode, extra?: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "#7c7068", marginBottom: 5, fontWeight: 600 }}>{label}</div>
      {control}
      {extra && <div style={{ fontSize: 11, color: "#7c7068", marginTop: 4 }}>{extra}</div>}
    </div>
  );
  const link = (url: string | undefined, label: string) => url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: "#f3aa2f", fontSize: 11, marginRight: 12, opacity: .9 }}>{label} ↗</a> : null;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "36px 24px 72px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 className="cm-brand" style={{ fontSize: 40, margin: 0, fontWeight: 400 }}>Rack <span style={{ color: "#f3aa2f" }}>Config</span></h1>
        <span style={{ fontSize: 11, letterSpacing: ".2em", textTransform: "uppercase", color: "#7c7068" }}>机位设置 · MK-01</span>
        <Link href="/" style={{ marginLeft: "auto", color: "#b9ab9f", fontSize: 12 }}>← 回控制台</Link>
      </div>
      <p style={{ fontSize: 12, color: "#8a7c6d", marginTop: 6 }}>
        每个机位独立保存配置与 API Key。Key 只驻留本机 <code>.env.local</code>，浏览器侧只见 <code>sk-…末四位</code>；
        不输入新 Key 即保留历史，清除仅影响当前机位。
      </p>

      <RackPanel label="A · 机位选择" right={preset.access === "proxy" ? <span style={{ color: "#ff6a45" }}>需代理</span> : <span style={{ color: "#95d36e" }}>直连</span>}>
        {field("服务商", <Select style={{ width: "100%" }} value={form.providerId} options={groups()} onChange={applyProvider} />)}
        {field("信号协议", <Select style={{ width: "100%" }} value={form.apiFormat} options={[
          { label: "OpenAI 兼容（/chat/completions）", value: "openai" },
          { label: "Anthropic Messages（/messages）", value: "anthropic", disabled: form.providerId !== "custom" && !supportsAnthropic },
        ]} onChange={changeFormat} />)}
        {field("BaseURL",
          <input style={input} value={form.baseURL} placeholder="https://api.openai.com/v1" onChange={(e) => set("baseURL", e.target.value)} />,
          <>{link(preset.docsUrl, "接入文档")}{link(preset.consoleUrl, "获取 Key")}{link(preset.balanceUrl, "余额 / 充值")}<span style={{ color: "#7c7068" }}>{preset.note}</span></>)}
      </RackPanel>

      <RackPanel label="B · API Key" right={
        history?.hasApiKey
          ? <Popconfirm title="清除该机位的 API Key？" description="不影响其他机位。清除后需保存生效。" okText="清除" cancelText="取消" onConfirm={() => { setReplacementKey(""); setClearKey(true); }}>
              <button style={{ fontSize: 11, border: "none", background: "transparent", color: "#df5260", cursor: "pointer" }}>清除本槽 Key</button>
            </Popconfirm>
          : <span style={{ fontSize: 11, color: "#7c7068" }}>空槽</span>
      }>
        {history?.hasApiKey && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, fontSize: 12 }}>
            <span className="cm-lamp cm-lamp--ok" /> 本机已接入 · <code style={{ color: "#f3aa2f", fontFamily: "var(--cm-mono)" }}>{history.apiKeyMasked}</code>
            {clearKey && <Tag color="red">待清除（保存后生效）</Tag>}
          </div>
        )}
        {field("输入新 Key（可留空）",
          <input type="password" style={input} value={replacementKey} autoComplete="off"
            placeholder={clearKey ? "保存后将清除本机记录" : history?.hasApiKey ? "留空即保留现有 Key；输入则整体替换" : "此机位还没有 Key，填入后保存"}
            onChange={(e) => { setReplacementKey(e.target.value); setClearKey(false); }} />,
          "Key 只在点击「通电激活」时发送；历史 Key 永不回传浏览器。")}
      </RackPanel>

      <RackPanel label="C · 参数">
        {field("模型", <AutoComplete style={{ width: "100%" }} value={form.model} options={preset.models.map((m) => ({ label: `${m.label}${m.reasoning ? " · 推理" : ""}`, value: m.id }))} onChange={(v) => set("model", v)} placeholder={preset.defaultModel || "模型名"} />)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {field(`Temperature · ${form.temperature}`, <Slider min={0} max={2} step={0.1} value={form.temperature} onChange={(v) => set("temperature", v)} />)}
          {field("Max Tokens", <AutoComplete style={{ width: "100%" }} value={String(form.maxTokens)} options={[1024, 2048, 4096, 8192, 16384].map((n) => ({ value: String(n) }))} onChange={(v) => set("maxTokens", Math.max(1, Math.min(32768, Number(v) || 4096)))} />)}
        </div>
        {field("思考模式", <Switch checked={form.thinking} onChange={(v) => set("thinking", v)} />, "透传 reasoning / 思考链（DeepSeek V4 等）")}
      </RackPanel>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="cm-transport" onClick={save}>⏻ 通电激活</button>
        <button className="cm-knobbtn" onClick={test} disabled={testing}>{testing ? "探测中…" : "TEST SIGNAL · 接入诊断"}</button>
        {activeId === profileId && <span className="cm-chip"><span className="cm-lamp cm-lamp--ok" style={{ width: 6, height: 6 }} />当前在用机位</span>}
      </div>
      {msg && <Alert style={{ marginTop: 12 }} type={msg.kind === "ok" ? "success" : "error"} showIcon message={<span style={{ fontSize: 12 }}>{msg.text}</span>} />}
      {testing && <Spin style={{ display: "block", marginTop: 10 }} />}
    </main>
  );
}
