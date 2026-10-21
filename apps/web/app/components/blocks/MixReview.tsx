"use client";

import { Activity } from "lucide-react";
import { Lamp, Leds } from "./shared";

export function MixReview({ report }: { report: Record<string, unknown> }) {
  const r = report as unknown as {
    score: number; verdict: string; retried: number; comment?: string;
    perDimension?: Record<string, number>;
    rules?: { name: string; passed: boolean; blocking?: boolean }[];
  };
  return (
    <div className="cm-panel" style={{ margin: "8px 0", padding: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Activity size={14} style={{ color: "#f3aa2f" }} />
        <span style={{ fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 600 }}>Mix Review</span>
        <span className="cm-chip" style={{ marginLeft: "auto" }}>
          <Lamp kind={r.verdict === "pass" ? "ok" : "rec"} />
          {r.verdict === "pass" ? "PASS" : r.verdict === "give-up" ? "GIVE UP" : "RE-TAKE"} · {r.score}/5 · 第 {r.retried} 次重派
        </span>
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
        {Object.entries(r.perDimension ?? {}).map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 66, fontSize: 11, color: "#8a7c6d", textTransform: "uppercase", letterSpacing: ".08em" }}>{k}</span>
            <Leds pct={(v / 5) * 100} />
            <span style={{ fontFamily: "var(--cm-mono)", fontSize: 11, color: "#b9ab9f", marginLeft: "auto" }}>{(v * 20 - 100).toFixed(0)} dB</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {(r.rules ?? []).map((x) => (
          <span key={x.name} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 11, color: x.passed ? "#95d36e" : x.blocking === false ? "#f3aa2f" : "#df5260" }}>
            <Lamp kind={x.passed ? "ok" : x.blocking === false ? "signal" : "err"} /> {x.name}{x.blocking === false ? "（软）" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
