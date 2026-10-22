/**
 * 统一配置管理：所有阈值/超时/上限集中定义，环境变量可覆盖
 * 遵循 12-Factor App：配置优先级 ENV > 代码默认值
 */

export const CONFIG = {
  /** Agent 编排配置 */
  agent: {
    /** 评分通过阈值（judge score ≥ 此值视为 pass） */
    passThreshold: Number(process.env.PASS_THRESHOLD) || 3.5,
    /** 最大重派次数 */
    maxRetries: Number(process.env.MAX_RETRIES) || 3,
    /** dispatch 节拍延迟（ms，可观测用） */
    dispatchDelayMs: Number(process.env.DISPATCH_DELAY_MS) || 120,
  },
  
  /** 持久化配置 */
  storage: {
    /** 会话上限 */
    sessionCap: Number(process.env.SESSION_CAP) || 20,
    /** 消息上限 */
    msgCap: Number(process.env.MSG_CAP) || 200,
    /** 作品看板快照 TTL（ms） */
    boardTtlMs: Number(process.env.BOARD_TTL_MS) || 10 * 60_000,
    /** 失败快照 TTL（ms） */
    resumeTtlMs: Number(process.env.RESUME_TTL_MS) || 24 * 3600_000,
  },
  
  /** Suno 引擎配置 */
  suno: {
    /** 人工验证等待上限（ms） */
    captchaTtlMs: Number(process.env.SUNO_CAPTCHA_TTL_MS) || 600_000,
    /** 人工验证轮询间隔（ms） */
    captchaPollMs: Number(process.env.SUNO_CAPTCHA_POLL_MS) || 5_000,
    /** 音频轮询超时（ms） */
    waitAudioMs: Number(process.env.SUNO_WAIT_AUDIO_MS) || 300_000,
  },
  
  /** LLM 配置 */
  llm: {
    /** 请求失败重试次数 */
    maxRetries: Number(process.env.LLM_MAX_RETRIES) || 2,
    /** 单次请求超时（ms） */
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 60_000,
    /** 重试退避基数（ms） */
    retryBackoffMs: Number(process.env.LLM_RETRY_BACKOFF_MS) || 1000,
  },
  
  /** 事件流配置 */
  stream: {
    /** 思考帧节流间隔（ms） */
    thinkingThrottleMs: Number(process.env.THINKING_THROTTLE_MS) || 80,
    /** 思考帧节流字符数 */
    thinkingThrottleChars: Number(process.env.THINKING_THROTTLE_CHARS) || 240,
  },
} as const;

/** 开发环境：打印配置（生产环境静默） */
if (process.env.NODE_ENV !== "production" && process.env.DEBUG_CONFIG) {
  console.log("[CONFIG] Loaded:", JSON.stringify(CONFIG, null, 2));
}

// node:fs .env parsers live in `@colormax/config/server` so client bundles
// that import CONFIG never pull Node built-ins.
