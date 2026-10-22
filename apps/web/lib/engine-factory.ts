import { MockAdapter, SunoAdapter, EngineRegistry, type EngineAdapter } from "@colormax/engine";
import { sunoEnv } from "./env";
import { GENERATED_DIR } from "./paths";

/**
 * 全局引擎注册表实例
 * 单一真相来源（Single Source of Truth）
 */
const engineRegistry = new EngineRegistry();

// 注册 Mock 引擎（开发/测试）
engineRegistry.register(
  "mock",
  new MockAdapter(GENERATED_DIR),
  false,
);

// 注册 Suno 引擎（生产）
const { cookies, fingerprint, userAgent } = sunoEnv();
if (cookies.length > 0) {
  engineRegistry.register(
    "suno",
    new SunoAdapter({
      cookies,
      publicDir: GENERATED_DIR,
      fingerprint,
      userAgent,
    }),
    true, // 有 cookies 时设为默认
  );
}

/**
 * 引擎工厂：根据注册表选择引擎
 * 策略：有 SUNO_COOKIES 则用 Suno，否则用 Mock（本地合成可播音频）
 * 
 * 未来扩展：
 * - ENGINE_PROVIDER=mureka → MurekaAdapter
 * - ENGINE_PROVIDER=eleven → ElevenMusicAdapter
 * - ENGINE_PROVIDER=ace-step → ACEStepAdapter
 */
export function createEngine(): {
  engine: EngineAdapter;
  mode: "mock" | "suno";
  modeDoc: string;
} {
  const engine = engineRegistry.get();
  if (!engine) {
    // Fallback: 注册表为空时返回 Mock
    return {
      engine: new MockAdapter(GENERATED_DIR),
      mode: "mock",
      modeDoc: "Mock 本地合成（注册表为空）",
    };
  }

  const defaultId = engineRegistry.getDefaultId();
  const mode = defaultId === "suno" ? "suno" : "mock";
  const modeDoc = mode === "suno"
    ? `Suno 真实引擎（${cookies.length} cookies）`
    : "Mock 本地合成（未配置 SUNO_COOKIES）";

  return { engine, mode, modeDoc };
}

/**
 * 导出注册表供测试/扩展使用
 */
export { engineRegistry };
