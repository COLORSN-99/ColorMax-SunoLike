import { join } from "node:path";
import { execSync } from "node:child_process";

/**
 * 运行时路径常量（环境变量可覆盖，默认 process.cwd() 基准）
 * 统一管理文件生成路径，避免硬编码重复
 */

/** 工作区根目录 */
export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

/** 生成文件目录（引擎输出、音频缓存） */
export const GENERATED_DIR = process.env.GENERATED_DIR || join(WORKSPACE_ROOT, "public/generated");

/** 缓存目录（预留：转码缓存、临时文件） */
export const CACHE_DIR = process.env.CACHE_DIR || join(WORKSPACE_ROOT, "public/cache");

/**
 * 自动查找 ffmpeg 路径（优先级：环境变量 > which > 常见路径）
 * @throws {Error} 未找到 ffmpeg 时抛出友好错误提示
 */
export function findFFmpegPath(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  
  // 尝试 which ffmpeg（跨平台）
  try {
    const path = execSync("which ffmpeg", { encoding: "utf-8" }).trim();
    if (path) return path;
  } catch {
    // which 失败，尝试常见路径
  }
  
  const candidates = [
    "/usr/bin/ffmpeg",              // Linux 标准路径
    "/usr/local/bin/ffmpeg",        // Linux/macOS Homebrew 旧版
    "/opt/homebrew/bin/ffmpeg",     // macOS Apple Silicon
    "C:\\ffmpeg\\bin\\ffmpeg.exe",  // Windows（预留）
  ];
  
  for (const path of candidates) {
    try {
      execSync(`"${path}" -version`, { stdio: "ignore" });
      return path;
    } catch {
      continue;
    }
  }
  
  throw new Error(
    "未找到 ffmpeg：请安装 ffmpeg 或设置环境变量 FFMPEG_PATH\n" +
    "  Ubuntu/Debian: sudo apt install ffmpeg\n" +
    "  macOS: brew install ffmpeg\n" +
    "  或手动设置: export FFMPEG_PATH=/path/to/ffmpeg"
  );
}

/** ffmpeg 可执行文件路径（延迟计算，首次访问时查找） */
let _ffmpegPath: string | null = null;
export function getFFmpegPath(): string {
  if (_ffmpegPath === null) {
    _ffmpegPath = findFFmpegPath();
  }
  return _ffmpegPath;
}

/**
 * 生成文件命名（统一前缀规范）
 * @param prefix - 文件前缀（如 "suno", "mock"）
 * @param seed - 种子值（用于幂等性）
 * @param ext - 文件扩展名（不含点号）
 */
export function genFileName(prefix: string, seed: number, ext: string): string {
  return `${prefix}_${seed}_${Date.now()}.${ext}`;
}
