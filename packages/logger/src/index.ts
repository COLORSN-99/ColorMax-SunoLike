import pino from "pino";

/**
 * 日志级别
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

/**
 * 日志配置
 */
export interface LoggerConfig {
  /** 日志级别 */
  level?: LogLevel;
  /** 是否启用美化输出（开发环境） */
  pretty?: boolean;
  /** 应用名称 */
  name?: string;
}

/**
 * 创建结构化日志器
 * - 生产环境：JSON 格式（便于日志聚合）
 * - 开发环境：美化输出（可读性）
 */
export function createLogger(config: LoggerConfig = {}) {
  const {
    level = process.env.LOG_LEVEL as LogLevel || "info",
    pretty = process.env.NODE_ENV !== "production",
    name = "colormax",
  } = config;

  return pino({
    name,
    level,
    ...(pretty && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    }),
  });
}

/**
 * 默认全局日志器实例
 */
export const logger = createLogger();

/**
 * 标准错误层次结构基类
 * 支持结构化错误信息（上下文、错误码、是否可重试）
 */
export class AppError extends Error {
  /** 错误码（便于客户端识别） */
  public readonly code: string;
  /** 错误上下文数据 */
  public readonly context?: Record<string, unknown>;
  /** 是否可重试 */
  public readonly retryable: boolean;
  /** HTTP 状态码（API 错误时使用） */
  public readonly statusCode?: number;

  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      retryable?: boolean;
      statusCode?: number;
      cause?: Error;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? "UNKNOWN_ERROR";
    this.context = options.context;
    this.retryable = options.retryable ?? false;
    this.statusCode = options.statusCode;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * 转换为结构化日志对象
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : this.cause,
    };
  }
}

/**
 * 验证错误（400 Bad Request）
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      context,
      retryable: false,
    });
  }
}

/**
 * 未找到错误（404 Not Found）
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with id ${id}` : ""} not found`, {
      code: "NOT_FOUND",
      statusCode: 404,
      context: { resource, id },
      retryable: false,
    });
  }
}

/**
 * 未授权错误（401 Unauthorized）
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", context?: Record<string, unknown>) {
    super(message, {
      code: "UNAUTHORIZED",
      statusCode: 401,
      context,
      retryable: false,
    });
  }
}

/**
 * 权限不足错误（403 Forbidden）
 */
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", context?: Record<string, unknown>) {
    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
      context,
      retryable: false,
    });
  }
}

/**
 * 冲突错误（409 Conflict）
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "CONFLICT",
      statusCode: 409,
      context,
      retryable: false,
    });
  }
}

/**
 * 外部服务错误（502 Bad Gateway）
 */
export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, cause?: Error) {
    super(`External service ${service} error: ${message}`, {
      code: "EXTERNAL_SERVICE_ERROR",
      statusCode: 502,
      context: { service },
      retryable: true,
      cause,
    });
  }
}

/**
 * 超时错误（504 Gateway Timeout）
 */
export class TimeoutError extends AppError {
  constructor(operation: string, timeout: number) {
    super(`Operation ${operation} timed out after ${timeout}ms`, {
      code: "TIMEOUT",
      statusCode: 504,
      context: { operation, timeout },
      retryable: true,
    });
  }
}

/**
 * 配置错误（500 Internal Server Error）
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, {
      code: "CONFIGURATION_ERROR",
      statusCode: 500,
      context,
      retryable: false,
    });
  }
}
