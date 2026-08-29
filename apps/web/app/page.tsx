"use client";

import { useState, useRef } from "react";
import Link from "next/link";

interface Intent {
  theme: string;
  mood: string;
  style: string;
  durationSec: number;
  extra?: string[];
}
interface Plan {
  title: string;
  structure: { name: string; lyrics: string }[];
  arrangement: { key: string; bpm: number; chordProgression: string[]; groove: string };
  seed: number;
}

export default function Studio() {
  const [prompt, setPrompt] = useState("给妈妈写一首温暖的中文抒情歌");
  const [mood, setMood] = useState("温暖");
  const [style, setStyle] = useState("华语抒情");
  const [duration, setDuration] = useState(180);
  const [logs, setLogs] = useState<string[]>([]);
  const [intent, setIntent] = useState<Intent | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const run = async () => {
    setBusy(true);
    setIntent(null);
    setPlan(null);
    setError(null);
    const lines: string[] = [];
    setLogs(lines);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mood, style, duration }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
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
          try {
            const parsed = JSON.parse(data);
            if (ev === "intent") {
              setIntent(parsed);
              lines.push(`✓ 意图分析：${parsed.theme} · ${parsed.mood} · ${parsed.style} · ${parsed.durationSec}s`);
            } else if (ev === "plan") {
              setPlan(parsed);
              lines.push(`✓ 创作规划：《${parsed.title}》${parsed.arrangement.key}调 ${parsed.arrangement.bpm}bpm · 段落 ${parsed.structure.length} 段 · seed=${parsed.seed}`);
            } else if (ev === "error") {
              throw new Error(parsed.message);
            }
          } catch (e) {
            throw e instanceof Error ? e : new Error(String(e));
          }
        }
        setLogs([...lines]);
        if (logRef.current) logRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <h1>ColorMax 创作室 <span className="badge">Stage 1 · 意图/规划</span></h1>
      <p className="label">
        一句话，一首歌。先完成意图分析与创作规划（真实 LLM，需先{" "}
        <Link href="/settings">配置模型</Link>）。
      </p>
      <div className="card">
        <textarea
          className="prompt"
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="输入创作想法…"
        />
        <div className="row">
          <span className="label">情绪</span>
          <input value={mood} onChange={(e) => setMood(e.target.value)} />
          <span className="label">风格</span>
          <input value={style} onChange={(e) => setStyle(e.target.value)} />
          <span className="label">时长(秒)</span>
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[90, 150, 180, 210, 240].map((s) => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
          <button onClick={run} disabled={busy || !prompt.trim()}>
            {busy ? "创作中…" : "开始创作"}
          </button>
        </div>
      </div>

      {error && <div className="card" style={{ color: "#b00020" }}>错误：{error}</div>}

      {logs.length > 0 && (
        <div className="card">
          <b>阶段输出</b>
          <div ref={logRef} className="state">
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </div>
      )}

      {plan && (
        <div className="card">
          <b>创作计划</b>
          <div className="state">
            <pre>{JSON.stringify(plan, null, 2)}</pre>
          </div>
        </div>
      )}
    </main>
  );
}
