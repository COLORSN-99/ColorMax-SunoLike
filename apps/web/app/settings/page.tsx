"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Settings() {
  const [form, setForm] = useState({
    baseURL: "",
    apiKey: "",
    model: "",
    temperature: 0.8,
  });
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) =>
        setForm({
          baseURL: s.baseURL ?? "",
          apiKey: s.apiKey ?? "",
          model: s.model ?? "",
          temperature: s.temperature ?? 0.8,
        }),
      );
  }, []);

  const save = async () => {
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) setMsg(`保存失败：${data.error ?? res.status}`);
    else setMsg("保存成功（API 侧即时生效）");
  };

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <main>
      <h1>LLM 设置 <span className="badge">OpenAI 兼容</span></h1>
      <p className="label">全链路真实调用，无 mock。默认指向本地 OpenAI 兼容端点（如 Ollama / LM Studio）。</p>
      <div className="card">
        {(
          [
            ["baseURL", "Base URL", "http://localhost:11434/v1"],
            ["apiKey", "API Key（本地端点可空）", ""],
            ["model", "Model", "qwen2.5"],
          ] as const
        ).map(([k, label, ph]) => (
          <div key={k} style={{ marginBottom: 10 }}>
            <div className="label">{label}</div>
            <input
              style={{ width: "100%", padding: 8 }}
              value={form[k]}
              placeholder={ph}
              onChange={(e) => set(k, e.target.value)}
            />
          </div>
        ))}
        <div style={{ marginBottom: 10 }}>
          <div className="label">Temperature</div>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.temperature}
            onChange={(e) => set("temperature", Number(e.target.value))}
          />
        </div>
        <button onClick={save}>保存</button>{" "}
        <Link href="/">返回创作室</Link>
        <div className="label" style={{ marginTop: 8 }}>{msg}</div>
      </div>
    </main>
  );
}
