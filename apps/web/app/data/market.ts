/** 应用服务市场数据源（后续由真实服务目录/插件注册驱动；当前为 baseline 展示） */
export interface SpecItem {
  key: string;
  name: string;
  desc: string;
  status: "running" | "coming";
  tag?: string;
}

export const SERVICE_MARKET: SpecItem[] = [
  { key: "multi-agent", name: "多 Agent 联合编曲", desc: "Leader 意图分析 → 编曲/词/歌声/混音子 Agent 分工", status: "running", tag: "B1" },
  { key: "intent", name: "意图分析", desc: "主题/情绪/风格/时长解析（LLM）", status: "running", tag: "B1" },
  { key: "plan", name: "创作规划", desc: "歌词结构 + 编曲参数（MIDI 调性/BPM/和弦/节奏型）", status: "running", tag: "B1" },
  { key: "engine-suno", name: "Suno 引擎", desc: "SunoAdapter · 源格式出歌（Stage 3）", status: "coming", tag: "B4" },
  { key: "engine-mock", name: "Mock 引擎（调试）", desc: "开发期兜底音频合成", status: "coming", tag: "spec" },
  { key: "align-judge", name: "对齐评判", desc: "原语义 ↔ 交付统一建模对齐 + 效果评分（Stage 2）", status: "coming", tag: "B1" },
  { key: "sync", name: "创作资产库/并行流水线", desc: "作品版本管理 · 批量创作 · 可复现工作流（Stage 4+）", status: "coming", tag: "B3" },
];

export const PLUGIN_MARKET: SpecItem[] = [
  { key: "studio", name: "Studio DAW 空间", desc: "专业级沉浸创作空间（第三方能力封装/Stem 解剖，Stage 4+）", status: "coming", tag: "B4" },
  { key: "stems", name: "Stem 分轨 / MIDI 导出", desc: "可解剖作品栈（Stage 4+）", status: "coming", tag: "B4" },
];
