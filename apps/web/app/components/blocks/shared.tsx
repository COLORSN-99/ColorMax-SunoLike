"use client";

/**
 * Analog Console 共享组件
 * 灯光指示器、面板切换箭头、LED 电平表、节点标签
 */

export const NODE_LABEL: Record<string, string> = {
  intent: "意图分析",
  plan: "创作规划",
  judge: "混音评判",
  "error-review": "错误诊断",
};

export function Lamp({ kind }: { kind: "signal" | "rec" | "ok" | "err" | "idle" }) {
  return <span className={`cm-lamp cm-lamp--${kind}`} />;
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform .18s ease",
        display: "inline-block",
        fontSize: 9,
        color: "#8a7c6d",
      }}
    >
      ▶
    </span>
  );
}

export function Leds({ pct, hot }: { pct: number; hot?: boolean }) {
  const on = Math.max(0, Math.min(14, Math.round((pct / 100) * 14)));
  return (
    <span className="cm-leds" style={{ width: 96 }}>
      {Array.from({ length: 14 }, (_, i) => (
        <i key={i} className={i < on ? (hot && i > 10 ? "on hot" : "on") : undefined} />
      ))}
    </span>
  );
}
