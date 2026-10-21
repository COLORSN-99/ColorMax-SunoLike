"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Chevron } from "./shared";

export function SessionSheet({ plan }: { plan: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: "8px 0" }}>
      <div className="cm-head" onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <SlidersHorizontal size={13} style={{ color: "#f3aa2f" }} />
        <span>SESSION SHEET · 创作计划</span>
        <span className="cm-head__meta">{open ? "收起" : "查看"}</span>
      </div>
      {open && <pre className="cm-body" style={{ fontFamily: "var(--cm-mono)", fontSize: 11, color: "#d9c9a6", maxHeight: 260, overflow: "auto", margin: 0 }}>{JSON.stringify(plan, null, 2)}</pre>}
    </div>
  );
}
