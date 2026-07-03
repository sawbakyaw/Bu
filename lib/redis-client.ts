/**
 * Redis Client Module
 * Distributed caching and distributed locking for seat management
 * Handles connection management, retries, and graceful degradation
 */

import { redisConfig } from './config';

// ============================================
// TYPES
// ============================================

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttlMs: number): Promise<boolean>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  setnx(key: string, value: string, ttlMs?: number): Promise<boolean>;
  getSet(key: string, value: string, ttlMs?: number): Promise<string | null>;
  hget(hash: string, field: string): Promise<string | null>;
  hset(hash: string, field: string, value: string): Promise<boolean>;
  hdel(hash: string, field: string): Promise<boolean>;
  hgetall(hash: string): Promise<Record<string, string>>;
  sadd(set: string, ...members: string[]): Promise<number>;
  srem(set: string, ...members: string[]): Promise<number>;
  smembers(set: string): Promise<string[]>;
  sismember(set: string, member: string): Promise<boolean>;
  scard(set: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  scan(cursor: number, pattern: string, count?: number): Promise<[number, string[]]>;
  multi(): RedisPipeline;
  pubsub: {
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string, callback: (message: string) => void): () => void;
  };
  isConnected(): boolean;
  disconnect(): Promise<void>;
  reconnect(): Promise<void>;
  getStats(): RedisStats;
}

export interface RedisPipeline {
  set(key: string, value: string, ttlMs?: number): RedisPipeline;
  get(key: string): RedisPipeline;
  del(key: string): RedisPipeline;
  expire(key: string, ttlMs: number): RedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

export interface RedisStats {
  connected: boolean;
  totalCommands: number;
  totalConnections: number;
  lastError?: string;
  latency: number;
}

// ============================================
// IN-MEMORY FALLBACK (When Redis is unavailable)
// ============================================

class InMemoryRedis implements RedisClient {
  private store: Map<string, { value: string; expiresAt?: number }> = new Map();
  private hashes: Map<string, Map<string, string>> = new Map();
  private sets: Map<string, Set<string>> = new Map();
  private stats: RedisStats = { connected: true, totalCommands: 0, totalConnections: 0, latency: 0 };
  private pubsubChannels: Map<string, Set<(message: string) => void>> = new Map();
  private lockWaiters: Map<string, Set<() => void>> = new Map();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  private cleanup(): void {
    const now = Date.now();
    const entries = Array.from(this.store.entries());
    for (const [key, entry] of entries) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    this.cleanup();
    this.stats.totalCommands++;
    const entry = this.store.get(key);
    if (!entry || this.isExpired(key)) return null;
    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<boolean> {
    this.stats.totalCommands++;
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    this.store.set(key, { value, expiresAt });
    return true;
  }

  async del(key: string): Promise<boolean> {
    this.stats.totalCommands++;
    this.store.delete(key);
    this.hashes.delete(key);
    this.sets.delete(key);
    return true;
  }

  async exists(key: string): Promise<boolean> {
    this.stats.totalCommands++;
    this.cleanup();
    return this.store.has(key) && !this.isExpired(key);
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    this.stats.totalCommands++;
    const entry = this.store.get(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + ttlMs;
    return true;
  }

  async ttl(key: string): Promise<number> {
    this.stats.totalCommands++;
    const entry = this.store.get(key);
    if (!entry) return -2;
    if (!entry.expiresAt) return -1;
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async incr(key: string): Promise<number> {
    this.stats.totalCommands++;
    const entry = this.store.get(key);
    const current = parseInt(entry?.value || '0', 10);
    const newValue = current + 1;
    this.store.set(key, { value: newValue.toString(), expiresAt: entry?.expiresAt });
    return newValue;
  }

  async decr(key: string): Promise<number> {
    this.stats.totalCommands++;
    const entry = this.store.get(key);
    const current = parseInt(entry?.value || '0', 10);
    const newValue = current - 1;
    this.store.set(key, { value: newValue.toString(), expiresAt: entry?.expiresAt });
    return newValue;
  }

  async setnx(key: string, value: string, ttlMs?: number): Promise<boolean> {
    this.stats.totalCommands++;
    if (await this.exists(key)) return false;
    await this.set(key, value, ttlMs);
    return true;
  }

  async getSet(key: string, value: string, ttlMs?: number): Promise<string | null> {
    this.stats.totalCommands++;
    const old = await this.get(key);
    await this.set(key, value, ttlMs);
    return old;
  }

  async hget(hash: string, field: string): Promise<string | null> {
    this.stats.totalCommands++;
    const h = this.hashes.get(hash);
    return h?.get(field) || null;
  }

  async hset(hash: string, field: string, value: string): Promise<boolean> {
    this.stats.totalCommands++;
    if (!this.hashes.has(hash)) {
      this.hashes.set(hash, new Map());
    }
    this.hashes.get(hash)!.set(field, value);
    return true;
  }

  async hdel(hash: string, field: string): Promise<boolean> {
    this.stats.totalCommands++;
    return this.hashes.get(hash)?.delete(field) || false;
  }

  async hgetall(hash: string): Promise<Record<string, string>> {
    this.stats.totalCommands++;
    const h = this.hashes.get(hash);
    if (!h) return {};
    return Object.fromEntries(h.entries());
  }

  async sadd(set: string, ...members: string[]): Promise<number> {
    this.stats.totalCommands++;
    if (!this.sets.has(set)) {
      this.sets.set(set, new Set());
    }
    const s = this.sets.get(set)!;
    let added = 0;
    for (const member of members) {
      if (!s.has(member)) {
        s.add(member);
        added++;
      }
    }
    return added;
  }

  async srem(set: string, ...members: string[]): Promise<number> {
    this.stats.totalCommands++;
    const s = this.sets.get(set);
    if (!s) return 0;
    let removed = 0;
    for (const member of members) {
      if (s.delete(member)) removed++;
    }
    return removed;
  }

  async smembers(set: string): Promise<string[]> {
    this.stats.totalCommands++;
    const s = this.sets.get(set);
    return s ? Array.from(s) : [];
  }

  async sismember(set: string, member: string): Promise<boolean> {
    this.stats.totalCommands++;
    return this.sets.get(set)?.has(member) || false;
  }

  async scard(set: string): Promise<number> {
    this.stats.totalCommands++;
    return this.sets.get(set)?.size || 0;
  }

  async keys(pattern: string): Promise<string[]> {
    this.stats.totalCommands++;
    this.cleanup();
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter(k => regex.test(k));
  }

  async scan(cursor: number, pattern: string, count = 10): Promise<[number, string[]]> {
    const matched = await this.keys(pattern);
    const start = cursor;
    const batch = matched.slice(start, start + count);
    const nextCursor = start + batch.length >= matched.length ? 0 : start + count;
    return [nextCursor, batch];
  }

  multi(): RedisPipeline {
    const commands: Array<() => Promise<unknown>> = [];
    const self = this;
    return {
      set: function(key: string, value: string, ttlMs?: number) {
        commands.push(() => self.set(key, value, ttlMs) as unknown as Promise<void>);
        return this;
      },
      get: function(key: string) {
        commands.push(() => self.get(key));
        return this;
      },
      del: function(key: string) {
        commands.push(() => self.del(key) as unknown as Promise<void>);
        return this;
      },
      expire: function(key: string, ttlMs: number) {
        commands.push(() => self.expire(key, ttlMs) as unknown as Promise<void>);
        return this;
      },
      exec: async function(): Promise<Array<[Error | null, unknown]>> {
        const results: Array<[Error | null, unknown]> = [];
        for (const cmd of commands) {
          try {
            const result = await cmd();
            results.push([null, result]);
          } catch (err) {
            results.push([err as Error, null]);
          }
        }
        return results;
      },
    } as RedisPipeline;
  }

  pubsub = {
    publish: async (channel: string, message: string): Promise<number> => {
      const subscribers = this.pubsubChannels.get(channel);
      if (subscribers) {
        for (const callback of Array.from(subscribers)) {
          callback(message);
        }
      }
      return subscribers?.size || 0;
    },
    subscribe: (channel: string, callback: (message: string) => void): (() => void) => {
      if (!this.pubsubChannels.has(channel)) {
        this.pubsubChannels.set(channel, new Set());
      }
      this.pubsubChannels.get(channel)!.add(callback);
      return () => {
        this.pubsubChannels.get(channel)?.delete(callback);
      };
    },
  };

  isConnected(): boolean {
    return this.stats.connected;
  }

  async disconnect(): Promise<void> {
    this.stats.connected = false;
  }

  async reconnect(): Promise<void> {
    this.stats.connected = true;
  }

  getStats(): RedisStats {
    return { ...this.stats };
  }
}

// ============================================
// REAL REDIS CLIENT (Production)
// ============================================

class RealRedisClient implements RedisClient {
  private client: any = null;
  private subscriber: any = null;
  private connected = false;
  private reconnectAttempts = 0;
  private stats: RedisStats = { connected: false, totalCommands: 0, totalConnections: 0, latency: 0 };
  private config: ReturnType<typeof redisConfig>;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.config = redisConfig();
  }

  private async ensureConnection(): Promise<void> {
    if (this.connected && this.client) return;

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    await this.connectionPromise;
    this.connectionPromise = null;
  }

  private async connect(): Promise<void> {
    try {
      // Dynamic import for Redis (only when needed)
      // Note: ioredis is an optional dependency
      let Redis: any;
      try {
        Redis = require('ioredis');
      } catch {
        throw new Error('ioredis not installed, falling back to in-memory');
      }

      const options = {
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        keyPrefix: this.config.keyPrefix,
        connectionTimeout: this.config.connectionTimeout,
        commandTimeout: this.config.commandTimeout,
        maxRetriesPerRequest: this.config.maxRetries,
        enableReadyCheck: this.config.enableReadyCheck,
        enableOfflineQueue: this.config.enableOfflineQueue,
        retryStrategy: (times: number) => {
          if (times > this.config.maxRetries) {
            console.error('[Redis] Max retries exceeded');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 1000, 5000);
          console.warn(`[Redis] Retry ${times}/${this.config.maxRetries} in ${delay}ms`);
          return delay;
        },
      };

      this.client = new Redis(options);

      // Handle events
      this.client.on('connect', () => {
        console.log('[Redis] Connecting...');
      });

      this.client.on('ready', () => {
        console.log('[Redis] Connected');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.stats.connected = true;
        this.stats.totalConnections++;
      });

      this.client.on('error', (err: Error) => {
        console.error('[Redis] Error:', err);
        this.stats.lastError = err.message;
      });

      this.client.on('close', () => {
        console.warn('[Redis] Connection closed');
        this.connected = false;
        this.stats.connected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('[Redis] Reconnecting...');
        this.reconnectAttempts++;
      });

      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Redis connection timeout'));
        }, this.config.connectionTimeout);

        this.client!.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.client!.once('error', (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

    } catch (error) {
      console.error('[Redis] Failed to connect:', error);
      throw error;
    }
  }

  private measureLatency = async <T>(operation: () => Promise<T>): Promise<T> => {
    const start = Date.now();
    try {
      const result = await operation();
      this.stats.latency = Date.now() - start;
      this.stats.totalCommands++;
      return result;
    } catch (error) {
      this.stats.lastError = (error as Error).message;
      throw error;
    }
  };

  async get(key: string): Promise<string | null> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.get(key));
  }

  async set(key: string, value: string, ttlMs?: number): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      if (ttlMs) {
        await this.client.set(key, value, 'PX', ttlMs);
      } else {
        await this.client.set(key, value);
      }
      return true;
    });
  }

  async del(key: string): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      await this.client.del(key);
      return true;
    });
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const result = await this.client.exists(key);
      return result === 1;
    });
  }

  async expire(key: string, ttlMs: number): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const result = await this.client.pexpire(key, ttlMs);
      return result === 1;
    });
  }

  async ttl(key: string): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const result = await this.client.pttl(key);
      return result / 1000;
    });
  }

  async incr(key: string): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.incr(key));
  }

  async decr(key: string): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.decr(key));
  }

  async setnx(key: string, value: string, ttlMs?: number): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      if (ttlMs) {
        const result = await this.client.set(key, value, 'PX', ttlMs, 'NX');
        return result === 'OK';
      }
      const result = await this.client.setnx(key, value);
      return result === 1;
    });
  }

  async getSet(key: string, value: string, ttlMs?: number): Promise<string | null> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const old = await this.client.getset(key, value);
      if (ttlMs) {
        await this.client.pexpire(key, ttlMs);
      }
      return old;
    });
  }

  async hget(hash: string, field: string): Promise<string | null> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.hget(hash, field));
  }

  async hset(hash: string, field: string, value: string): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      await this.client.hset(hash, field, value);
      return true;
    });
  }

  async hdel(hash: string, field: string): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const result = await this.client.hdel(hash, field);
      return result === 1;
    });
  }

  async hgetall(hash: string): Promise<Record<string, string>> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.hgetall(hash));
  }

  async sadd(set: string, ...members: string[]): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.sadd(set, ...members));
  }

  async srem(set: string, ...members: string[]): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.srem(set, ...members));
  }

  async smembers(set: string): Promise<string[]> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.smembers(set));
  }

  async sismember(set: string, member: string): Promise<boolean> {
    await this.ensureConnection();
    return this.measureLatency(async () => {
      const result = await this.client.sismember(set, member);
      return result === 1;
    });
  }

  async scard(set: string): Promise<number> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.scard(set));
  }

  async keys(pattern: string): Promise<string[]> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.keys(pattern));
  }

  async scan(cursor: number, pattern: string, count = 10): Promise<[number, string[]]> {
    await this.ensureConnection();
    return this.measureLatency(() => this.client.scan(cursor, 'MATCH', pattern, 'COUNT', count));
  }

  multi(): RedisPipeline {
    const redis = this;
    const commands: Array<[string, ...any[]]> = [];

    const pipeline: RedisPipeline = {
      set(key: string, value: string, ttlMs?: number) {
        if (ttlMs) {
          commands.push(['set', key, value, 'PX', ttlMs]);
        } else {
          commands.push(['set', key, value]);
        }
        return pipeline;
      },
      get(key: string) {
        commands.push(['get', key]);
        return pipeline;
      },
      del(key: string) {
        commands.push(['del', key]);
        return pipeline;
      },
      expire(key: string, ttlMs: number) {
        commands.push(['pexpire', key, ttlMs]);
        return pipeline;
      },
      async exec() {
        await redis.ensureConnection();
        const multi = redis.client.multi();
        for (const [cmd, ...args] of commands) {
          (multi as any)[cmd](...args);
        }
        const results = await multi.exec();
        return results.map(([err, result]: [Error | null, unknown]) => [err, result]);
      },
    };

    return pipeline;
  }

  pubsub = {
    publish: async (channel: string, message: string): Promise<number> => {
      await this.ensureConnection();
      if (!this.subscriber) {
        // Initialize subscriber client
        let Redis: any;
        try {
          Redis = require('ioredis');
        } catch {
          throw new Error('ioredis not installed');
        }
        this.subscriber = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          keyPrefix: this.config.keyPrefix,
        });
      }
      return this.client.publish(channel, message);
    },
    subscribe: (channel: string, callback: (message: string) => void): (() => void) => {
      const handlers: Map<string, Map<(message: string) => void, (channel: string, message: string) => void>> = new Map();
      this.ensureConnection().then(() => {
        if (!this.subscriber) {
          // Initialize subscriber client
          let Redis: any;
          try {
            Redis = require('ioredis');
          } catch {
            throw new Error('ioredis not installed');
          }
          this.subscriber = new Redis({
            host: this.config.host,
            port: this.config.port,
            password: this.config.password,
            db: this.config.db,
            keyPrefix: this.config.keyPrefix,
          });
          this.subscriber.subscribe(channel);
        } else {
          this.subscriber.subscribe(channel);
        }

        const handler = (ch: string, message: string) => {
          if (ch === channel) {
            callback(message);
          }
        };

        if (!handlers.has(channel)) {
          handlers.set(channel, new Map());
        }
        handlers.get(channel)!.set(callback, handler);

        this.subscriber?.on('message', handler);
      });

      return () => {
        const handler = handlers.get(channel)?.get(callback);
        if (handler) {
          this.subscriber?.off('message', handler);
          handlers.get(channel)?.delete(callback);
        }
      };
    },
  };

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
      this.stats.connected = false;
    }
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    this.connectionPromise = null;
    await this.ensureConnection();
  }

  getStats(): RedisStats {
    return { ...this.stats };
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

let redisInstance: RedisClient | null = null;

export function getRedis(): RedisClient {
  const config = redisConfig();

  if (!config.enabled) {
    // Return in-memory fallback
    if (!redisInstance) {
      redisInstance = new InMemoryRedis();
      console.log('[Redis] Using in-memory fallback');
    }
    return redisInstance;
  }

  if (!redisInstance) {
    try {
      redisInstance = new RealRedisClient();
      console.log('[Redis] Initializing real Redis client');
    } catch (error) {
      console.error('[Redis] Failed to initialize, falling back to in-memory:', error);
      redisInstance = new InMemoryRedis();
    }
  }

  return redisInstance;
}

export function resetRedis(): void {
  redisInstance = null;
}

// Export for testing
export { InMemoryRedis, RealRedisClient };
