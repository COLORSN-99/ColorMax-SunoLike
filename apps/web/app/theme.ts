import { theme as antdTheme, type ThemeConfig } from "antd";

/**
 * 模拟录音控制台主题 —— 全站唯一 token 源（根 layout 的 ConfigProvider 使用）。
 * 色值与 globals.css 的 CSS variables 一一对应（--cm-*）。
 */
export const CM = {
  ink: "#0b0908",       // 机箱底板
  console: "#15110e",   // 台面
  panel: "#1d1815",     // 模块面板
  raised: "#27201b",    // 抬起件/旋钮座
  line: "#3d312a",      // 接缝
  text: "#f6f0e8",      // 暖白主字
  muted: "#b9ab9f",
  faint: "#7c7068",
  signal: "#f3aa2f",    // 琥珀信号
  signalSoft: "#fff0c9",
  amber: "#ff6a45",     // 录制/警示
  teal: "#48d8bd",      // 通过/在线
  crimson: "#df5260",
  success: "#95d36e",
} as const;

export const cmTheme: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    colorBgBase: CM.ink,
    colorBgContainer: CM.panel,
    colorBgElevated: CM.raised,
    colorBorder: CM.line,
    colorBorderSecondary: "#2a211c",
    colorText: CM.text,
    colorTextSecondary: CM.muted,
    colorTextTertiary: CM.faint,
    colorPrimary: CM.signal,
    colorInfo: CM.signal,
    colorSuccess: CM.success,
    colorWarning: CM.amber,
    colorError: CM.crimson,
    borderRadius: 6,
    fontSize: 14,
    fontFamily: "var(--cm-ui)",
  },
  components: {
    Card: { colorBgContainer: CM.panel, headerBg: "transparent", colorBorderSecondary: CM.line },
    Tag: { colorBgContainer: CM.raised, colorBorder: CM.line },
    Progress: { defaultColor: CM.signal, remainingColor: "#33291f" },
    Alert: { colorBgContainer: "#221a13" },
    Layout: { siderBg: CM.console, bodyBg: CM.ink, headerBg: CM.console },
    Input: { colorBgContainer: "#120e0b" },
    InputNumber: { colorBgContainer: "#120e0b" },
    Select: { colorBgContainer: "#120e0b" },
    Steps: { colorPrimary: CM.signal },
    Button: { primaryShadow: "none" },
  },
};
