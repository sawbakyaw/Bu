/**
 * Enterprise Logging System
 * Structured logging with multiple transports, redaction, and correlation
 */

import { loggingConfig, appConfig } from './config';

// ============================================
// TYPES
// ============================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  environment: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  sessionId?: string;
  requestId?: string;
  err?: {
    message: string;
    stack?: string;
    name: string;
    code?: string;
  };
  data?: Record<string, unknown>;
  duration?: number;
  http?: {
    method: string;
    url: string;
    statusCode?: number;
    userAgent?: string;
    ip?: string;
  };
}

export interface LoggerOptions {
  service?: string;
  defaultMeta?: Record<string, unknown>;
  redactKeys?: string[];
}

type LogFunction = (message: string, data?: Record<string, unknown>) => void;

// ============================================
// LOG LEVEL PRIORITY
// ============================================

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

// ============================================
// LOG FORMATTERS
// ============================================

function formatTimestamp(): string {
  return new Date().toISOString();
}

function redactSensitive(data: unknown, keys: string[]): unknown {
  if (typeof data !== 'object' || data === null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitive(item, keys));
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (keys.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      result[key] = redactSensitive(value, keys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function formatMessage(entry: LogEntry, pretty: boolean): string {
  if (pretty) {
    const levelColors: Record<LogLevel, string> = {
      trace: '\x1b[35m',
      debug: '\x1b[36m',
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      fatal: '\x1b[41m',
    };
    const reset = '\x1b[0m';
    const color = levelColors[entry.level];
    const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || entry.timestamp;
    const level = entry.level.toUpperCase().padEnd(5);
    const context = entry.userId
      ? ` [${entry.userId.substring(0, 8)}]`
      : entry.requestId
      ? ` [${entry.requestId.substring(0, 8)}]`
      : '';

    let message = `${timestamp} ${color}${level}${reset}${context} ${entry.message}`;

    if (entry.data) {
      message += `\n  ${JSON.stringify(entry.data, null, 2).split('\n').join('\n  ')}`;
    }

    if (entry.err) {
      message += `\n  Error: ${entry.err.message}`;
      if (entry.err.stack) {
        message += `\n  ${entry.err.stack.split('\n').slice(0, 3).join('\n  ')}`;
      }
    }

    return message;
  }

  return JSON.stringify(entry);
}

// ============================================
// LOG TRANSPORTS
// ============================================

interface LogTransport {
  log(entry: LogEntry): void | Promise<void>;
}

class ConsoleTransport implements LogTransport {
  constructor(private pretty: boolean = false) {}

  log(entry: LogEntry): void {
    const message = formatMessage(entry, this.pretty);
    const stream = entry.level === 'error' || entry.level === 'fatal'
      ? process.stderr
      : process.stdout;
    stream.write(message + '\n');
  }
}

class FileTransport implements LogTransport {
  private writeStream: NodeJS.WritableStream | null = null;

  constructor(private filePath: string) {
    // In browser, this won't work
    if (typeof process !== 'undefined' && process.versions?.node) {
      const fs = require('fs');
      this.writeStream = fs.createWriteStream(filePath, { flags: 'a' });
    }
  }

  log(entry: LogEntry): void {
    if (this.writeStream) {
      this.writeStream.write(JSON.stringify(entry) + '\n');
    }
  }

  close(): void {
    this.writeStream?.end();
  }
}

// ============================================
// LOGGER CLASS
// ============================================

class Logger {
  private service: string;
  private defaultMeta: Record<string, unknown>;
  private redactKeys: string[];
  private minLevel: LogLevel;
  private transports: LogTransport[] = [];
  private pretty: boolean;
  private environment: string;
  private traceId: string | null = null;
  private spanId: string | null = null;

  constructor(options: LoggerOptions = {}) {
    const config = loggingConfig();
    this.service = options.service || config.service;
    this.defaultMeta = options.defaultMeta || {};
    this.redactKeys = options.redactKeys || config.redactFields;
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || config.level;
    this.pretty = config.prettyPrint && typeof window === 'undefined';
    this.environment = appConfig().env;

    // Add console transport
    this.transports.push(new ConsoleTransport(this.pretty));
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private createEntry(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: formatTimestamp(),
      level,
      message,
      service: this.service,
      environment: this.environment,
      traceId: this.traceId || undefined,
      spanId: this.spanId || undefined,
    };

    // Add error if provided
    if (error) {
      entry.err = {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: (error as any).code,
      };
    }

    // Add data with redaction
    if (data) {
      entry.data = redactSensitive(data, this.redactKeys) as Record<string, unknown>;
    }

    // Merge default meta
    if (Object.keys(this.defaultMeta).length > 0) {
      entry.data = {
        ...(redactSensitive(this.defaultMeta, this.redactKeys) as Record<string, unknown>),
        ...entry.data,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry = this.createEntry(level, message, data);

    for (const transport of this.transports) {
      try {
        transport.log(entry);
      } catch (err) {
        // Don't throw on transport errors
        console.error('Log transport error:', err);
      }
    }
  }

  // Log methods
  trace: LogFunction = (message, data) => this.log('trace', message, data);
  debug: LogFunction = (message, data) => this.log('debug', message, data);
  info: LogFunction = (message, data) => this.log('info', message, data);
  warn: LogFunction = (message, data) => this.log('warn', message, data);
  error: LogFunction = (message, data) => this.log('error', message, data);
  fatal: LogFunction = (message, data) => this.log('fatal', message, data);

  // Error logging with stack trace
  logError(message: string, error: Error, data?: Record<string, unknown>): void {
    if (!this.shouldLog('error')) return;

    const entry = this.createEntry('error', message, data, error);

    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  // HTTP request logging
  http(
    method: string,
    url: string,
    statusCode?: number,
    data?: {
      duration?: number;
      userId?: string;
      ip?: string;
      userAgent?: string;
    }
  ): void {
    if (!this.shouldLog('info')) return;

    const entry = this.createEntry('info', `${method} ${url}`, data);
    entry.http = {
      method,
      url,
      statusCode,
      ip: data?.ip,
      userAgent: data?.userAgent,
    };
    entry.duration = data?.duration;
    entry.userId = data?.userId;

    for (const transport of this.transports) {
      transport.log(entry);
    }
  }

  // Child logger with additional context
  child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger({
      service: this.service,
      defaultMeta: { ...this.defaultMeta, ...context },
      redactKeys: this.redactKeys,
    });
    childLogger.traceId = this.traceId;
    childLogger.spanId = this.spanId;
    return childLogger;
  }

  // Set trace context
  setTraceContext(traceId: string, spanId?: string): void {
    this.traceId = traceId;
    this.spanId = spanId || null;
  }

  // Set user context
  setUser(userId: string, sessionId?: string): void {
    this.defaultMeta.userId = userId;
    if (sessionId) {
      this.defaultMeta.sessionId = sessionId;
    }
  }

  // Clear context
  clearContext(): void {
    this.traceId = null;
    this.spanId = null;
    delete this.defaultMeta.userId;
    delete this.defaultMeta.sessionId;
  }

  // Performance timing helper
  startTimer(): { end: (message: string, data?: Record<string, unknown>) => void } {
    const start = Date.now();

    return {
      end: (message: string, data?: Record<string, unknown>) => {
        const duration = Date.now() - start;
        this.info(message, { ...data, duration });
      },
    };
  }
}

// ============================================
// ERROR HANDLING
// ============================================

interface HandledError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('BAD_REQUEST', message, 400, details);
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(message: string = 'Not found'): AppError {
    return new AppError('NOT_FOUND', message, 404);
  }

  static conflict(message: string, details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, 409, details);
  }

  static tooMany(message: string = 'Too many requests'): AppError {
    return new AppError('RATE_LIMITED', message, 429);
  }

  static internal(message: string = 'Internal server error', error?: Error): AppError {
    return new AppError('INTERNAL_ERROR', message, 500, {
      originalError: error?.message,
      stack: error?.stack,
    });
  }

  toHandledError(): HandledError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

// ============================================
// ERROR MIDDLEWARE
// ============================================

interface AsyncHandler<T = unknown> {
  (...args: unknown[]): Promise<T>;
}

function asyncHandler<T>(handler: AsyncHandler<T>): AsyncHandler<T> {
  return async (...args: unknown[]): Promise<T> => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.logError('Async handler error', error as Error);
      throw error;
    }
  };
}

function handleDatabaseError(error: any): AppError {
  // PostgreSQL error codes
  const PG_ERRORS: Record<string, () => AppError> = {
    '23505': () => AppError.conflict('This record already exists'),
    '23503': () => AppError.badRequest('Related record not found'),
    '23502': () => AppError.badRequest('Required field missing'),
    '23514': () => AppError.badRequest('Data validation failed'),
    'P0001': () => AppError.internal('Database operation failed'),
    '08006': () => AppError.internal('Database connection failed'),
    '40001': () => AppError.conflict('Operation timed out, please retry'),
    '55P03': () => AppError.conflict('Resource locked, please retry'),
  };

  const handler = PG_ERRORS[error?.code];
  if (handler) {
    return handler();
  }

  // Supabase auth errors
  if (error?.message?.includes('JWT')) {
    return AppError.unauthorized('Invalid or expired token');
  }

  return AppError.internal('Database error', error);
}

function handleRedisError(error: any): AppError {
  if (error?.message?.includes('ECONNREFUSED')) {
    return AppError.internal('Cache connection failed');
  }

  return AppError.internal('Cache error', error);
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const logger = new Logger();

export { Logger, AppError, asyncHandler, handleDatabaseError, handleRedisError };
export type { HandledError };
