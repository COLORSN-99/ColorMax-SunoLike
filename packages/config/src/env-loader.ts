import { readFileSync, existsSync } from "node:fs";
import { z } from "zod";

/**
 * 统一 .env 文件加载器（Zod 验证）
 * 替代三处重复的 parseEnvFile 实现
 */

/**
 * 解析 .env 文件为键值对
 * @param path - .env 文件路径
 * @returns 环境变量键值对
 */
export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  
  const content = readFileSync(path, "utf-8");
  const result: Record<string, string> = {};
  
  for (const line of content.split("\n")) {
    // 跳过注释和空行
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    // 匹配 KEY=VALUE 格式
    const match = trimmed.match(/^([A-Z_0-9]+)=(.*)$/);
    if (!match) continue;
    
    const [, key, value] = match;
    // 移除首尾引号
    result[key!] = value!.replace(/^["']|["']$/g, "");
  }
  
  return result;
}

/**
 * 从 .env 文件加载并验证环境变量
 * @param path - .env 文件路径
 * @param schema - Zod schema
 * @returns 验证后的环境变量对象
 */
export function loadEnv<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
): z.infer<T> {
  const env = parseEnvFile(path);
  return schema.parse(env);
}

/**
 * 安全加载环境变量（验证失败返回默认值）
 * @param path - .env 文件路径
 * @param schema - Zod schema
 * @param defaultValue - 默认值
 * @returns 验证后的环境变量对象或默认值
 */
export function loadEnvSafe<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  defaultValue: z.infer<T>,
): z.infer<T> {
  try {
    const env = parseEnvFile(path);
    const result = schema.safeParse(env);
    return result.success ? result.data : defaultValue;
  } catch {
    return defaultValue;
  }
}
