import { join } from "node:path";

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
 * 生成文件命名（统一前缀规范）
 * @param prefix - 文件前缀（如 "suno", "mock"）
 * @param seed - 种子值（用于幂等性）
 * @param ext - 文件扩展名（不含点号）
 */
export function genFileName(prefix: string, seed: number, ext: string): string {
  return `${prefix}_${seed}_${Date.now()}.${ext}`;
}
