"use client";

import { useEffect, useRef, useState } from "react";
import { Gauge, Play } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Lamp } from "./shared";

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
