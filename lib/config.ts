/**
 * Enterprise Configuration Module
 * Centralized, type-safe configuration management with validation
 * Supports environment variables, secrets, and runtime config
 */

import { z } from 'zod';

// ============================================
// CONFIGURATION SCHEMAS
// ============================================

const ConfigSchema = z.object({
  // Application
  app: z.object({
    env: z.enum(['development', 'staging', 'production', 'test']),
    port: z.number().default(3000),
    host: z.string().default('localhost'),
    isProduction: z.boolean(),
    isDevelopment: z.boolean(),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  }),

  // Supabase (PostgreSQL)
  supabase: z.object({
    url: z.string().url(),
    anonKey: z.string(),
    serviceRoleKey: z.string().optional(),
    dbUrl: z.string().url().optional(),
    realtimeUrl: z.string().url().optional(),
  }),

  // Redis Cache
  redis: z.object({
    url: z.string().optional(),
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
    db: z.number().default(0),
    enabled: z.boolean().default(false),
    keyPrefix: z.string().default('mmbus:'),
    connectionTimeout: z.number().default(10000),
    commandTimeout: z.number().default(5000),
    maxRetries: z.number().default(3),
    enableReadyCheck: z.boolean().default(true),
    enableOfflineQueue: z.boolean().default(true),
  }),

  // Real-time
  realtime: z.object({
    heartbeatInterval: z.number().default(30000),
    connectionTimeout: z.number().default(10000),
    reconnectInitialDelay: z.number().default(1000),
    reconnectMaxDelay: z.number().default(60000),
    reconnectMaxAttempts: z.number().default(10),
    debounceWindow: z.number().default(100),
    maxSubscriptions: z.number().default(100),
    eventsPerSecond: z.number().default(10),
  }),

  // Seat Locking
  seatLock: z.object({
    defaultDurationMinutes: z.number().default(10),
    maxDurationMinutes: z.number().default(30),
    cleanupIntervalMs: z.number().default(30000),
    maxLocksPerSession: z.number().default(10),
    lockContentionRetries: z.number().default(3),
    lockContentionDelayMs: z.number().default(100),
    redisLockPrefix: z.string().default('seat_lock:'),
  }),

  // Rate Limiting
  rateLimit: z.object({
    enabled: z.boolean().default(true),
    redisEnabled: z.boolean().default(false),
    inMemoryFallback: z.boolean().default(true),
    searchLimit: z.number().default(30),
    bookingLimit: z.number().default(5),
    loginLimit: z.number().default(5),
    loginWindowMs: z.number().default(900000), // 15 mins
    apiLimit: z.number().default(100),
  }),

  // Security
  security: z.object({
    corsOrigins: z.array(z.string()),
    trustedProxies: z.array(z.string()),
    sessionSecret: z.string(),
    sessionMaxAge: z.number().default(86400),
    csrfEnabled: z.boolean().default(true),
    helmetEnabled: z.boolean().default(true),
  }),

  // Logging
  logging: z.object({
    service: z.string().default('mmbus-ticketing'),
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
    prettyPrint: z.boolean().default(false),
    redactFields: z.array(z.string()).default(['password', 'token', 'creditCard']),
    sentryDsn: z.string().optional(),
    logflareApiKey: z.string().optional(),
    logflareSourceToken: z.string().optional(),
  }),

  // External Services
  services: z.object({
    paymentGateway: z.string().optional(),
    paymentApiKey: z.string().optional(),
    smsProvider: z.string().optional(),
    smsApiKey: z.string().optional(),
    emailProvider: z.string().optional(),
    emailApiKey: z.string().optional(),
  }),
});

type Config = z.infer<typeof ConfigSchema>;

// ============================================
// CONFIGURATION LOADER
// ============================================

class ConfigurationError extends Error {
  constructor(message: string, public missingVars: string[] = []) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function loadConfig(): Config {
  const isProd = process.env.NODE_ENV === 'production';
  const isDev = process.env.NODE_ENV === 'development';

  // Parse CORS origins
  const corsOriginsEnv = process.env.CORS_ORIGINS || '';
  const corsOrigins = corsOriginsEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Parse trusted proxies
  const trustedProxiesEnv = process.env.TRUSTED_PROXIES || '';
  const trustedProxies = trustedProxiesEnv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // Build raw config object
  const rawConfig = {
    app: {
      env: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      host: process.env.HOST || 'localhost',
      isProduction: isProd,
      isDevelopment: isDev,
      logLevel: (process.env.LOG_LEVEL as any) || (isProd ? 'info' : 'debug'),
    },

    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      dbUrl: process.env.SUPABASE_DB_URL,
      realtimeUrl: process.env.SUPABASE_REALTIME_URL,
    },

    redis: {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      enabled: Boolean(process.env.REDIS_URL || process.env.REDIS_HOST),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'mmbus:',
      connectionTimeout: parseInt(process.env.REDIS_TIMEOUT || '10000', 10),
      commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      enableReadyCheck: process.env.REDIS_READY_CHECK !== 'false',
      enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false',
    },

    realtime: {
      heartbeatInterval: parseInt(process.env.REALTIME_HEARTBEAT || '30000', 10),
      connectionTimeout: parseInt(process.env.REALTIME_TIMEOUT || '10000', 10),
      reconnectInitialDelay: parseInt(process.env.REALTIME_RECONNECT_INITIAL || '1000', 10),
      reconnectMaxDelay: parseInt(process.env.REALTIME_RECONNECT_MAX || '60000', 10),
      reconnectMaxAttempts: parseInt(process.env.REALTIME_RECONNECT_MAX_ATTEMPTS || '10', 10),
      debounceWindow: parseInt(process.env.REALTIME_DEBOUNCE || '100', 10),
      maxSubscriptions: parseInt(process.env.REALTIME_MAX_SUBSCRIPTIONS || '100', 10),
      eventsPerSecond: parseInt(process.env.REALTIME_EVENTS_PER_SEC || '10', 10),
    },

    seatLock: {
      defaultDurationMinutes: parseInt(process.env.SEAT_LOCK_DURATION || '10', 10),
      maxDurationMinutes: parseInt(process.env.SEAT_LOCK_MAX_DURATION || '30', 10),
      cleanupIntervalMs: parseInt(process.env.SEAT_LOCK_CLEANUP_INTERVAL || '30000', 10),
      maxLocksPerSession: parseInt(process.env.SEAT_LOCK_MAX_PER_SESSION || '10', 10),
      lockContentionRetries: parseInt(process.env.SEAT_LOCK_RETRIES || '3', 10),
      lockContentionDelayMs: parseInt(process.env.SEAT_LOCK_RETRY_DELAY || '100', 10),
      redisLockPrefix: process.env.SEAT_LOCK_REDIS_PREFIX || 'seat_lock:',
    },

    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
      redisEnabled: Boolean(process.env.REDIS_URL),
      inMemoryFallback: process.env.RATE_LIMIT_MEMORY_FALLBACK !== 'false',
      searchLimit: parseInt(process.env.RATE_LIMIT_SEARCH || '30', 10),
      bookingLimit: parseInt(process.env.RATE_LIMIT_BOOKING || '5', 10),
      loginLimit: parseInt(process.env.RATE_LIMIT_LOGIN || '5', 10),
      loginWindowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW || '900000', 10),
      apiLimit: parseInt(process.env.RATE_LIMIT_API || '100', 10),
    },

    security: {
      corsOrigins: corsOrigins.length > 0 ? corsOrigins : (isProd ? [] : ['http://localhost:3000']),
      trustedProxies,
      sessionSecret: process.env.SESSION_SECRET || (isDev ? 'dev-secret-change-in-prod' : ''),
      sessionMaxAge: parseInt(process.env.SESSION_MAX_AGE || '86400', 10),
      csrfEnabled: process.env.CSRF_ENABLED !== 'false',
      helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    },

    logging: {
      service: process.env.LOG_SERVICE || 'mmbus-ticketing',
      level: (process.env.LOG_LEVEL as any) || (isProd ? 'info' : 'debug'),
      prettyPrint: isDev,
      redactFields: ['password', 'token', 'creditCard', 'apiKey', 'secret'],
      sentryDsn: process.env.SENTRY_DSN,
      logflareApiKey: process.env.LOGFLARE_API_KEY,
      logflareSourceToken: process.env.LOGFLARE_SOURCE_TOKEN,
    },

    services: {
      paymentGateway: process.env.PAYMENT_GATEWAY,
      paymentApiKey: process.env.PAYMENT_API_KEY,
      smsProvider: process.env.SMS_PROVIDER,
      smsApiKey: process.env.SMS_API_KEY,
      emailProvider: process.env.EMAIL_PROVIDER,
      emailApiKey: process.env.EMAIL_API_KEY,
    },
  };

  // Validate configuration
  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    const missingVars: string[] = [];
    const errors = result.error.issues;

    // Check for missing required fields
    for (const error of errors) {
      const path = error.path.join('_').toUpperCase();
      missingVars.push(path);
    }

    // Check critical Supabase config
    if (!rawConfig.supabase.url) {
      missingVars.push('NEXT_PUBLIC_SUPABASE_URL');
    }
    if (!rawConfig.supabase.anonKey) {
      missingVars.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }

    if (missingVars.length > 0) {
      throw new ConfigurationError(
        `Invalid configuration. Missing required environment variables: ${missingVars.join(', ')}`,
        missingVars
      );
    }
  }

  return result.data!;
}

// ============================================
// EXPORTED CONFIG
// ============================================

let configInstance: Config | null = null;

export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function reloadConfig(): Config {
  configInstance = loadConfig();
  return configInstance;
}

// Export typed config sections
export type { Config };
export { ConfigSchema, ConfigurationError };

// Convenience exports
export const appConfig = () => getConfig().app;
export const supabaseConfig = () => getConfig().supabase;
export const redisConfig = () => getConfig().redis;
export const realtimeConfig = () => getConfig().realtime;
export const seatLockConfig = () => getConfig().seatLock;
export const rateLimitConfig = () => getConfig().rateLimit;
export const securityConfig = () => getConfig().security;
export const loggingConfig = () => getConfig().logging;
export const servicesConfig = () => getConfig().services;
