"use client";

import { useState } from "react";
import { Terminal } from "lucide-react";
import type { Segment } from "@/lib/segments";
import { Chevron, Lamp } from "./shared";

export function TerminalBlock({ seg }: { seg: Extract<Segment, { kind: "terminal" }> }) {
  const [open, setOpen] = useState(seg.status !== "ok");
  const lamp = seg.status === "error" ? "err" : seg.status === "running" ? "rec" : "ok";
  const foot = seg.status === "running" ? "RUNNING" : seg.status === "error" ? "FAILED" : `DONE${seg.ms !== undefined ? ` · ${seg.ms}ms` : ""}`;
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <Terminal size={13} style={{ color: "#48d8bd" }} />
        <span style={{ fontFamily: "var(--cm-mono)" }}>{seg.tool}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#8a7c6d" }}>
          <Lamp kind={lamp} /> {foot}
        </span>
        {!open && <span className="cm-head__meta">{seg.lines.length} 行</span>}
      </div>
      {open && (
        <div className="cm-body" style={{ padding: "8px 12px" }}>
          {seg.lines.map((l, i) => (
            <div key={i} className={`cm-logline ${l.startsWith("!") ? "err" : l.startsWith("$") ? "cmd" : l.startsWith("·") || l.startsWith("✓") ? "ok" : "dim"}`}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
