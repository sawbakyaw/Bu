/**
 * Distributed Seat Lock Service
 * Enterprise-grade seat locking with Redis distributed locks
 * Handles race conditions, contention, and automatic cleanup
 */

import { getRedis, RedisClient } from './redis-client';
import { seatLockConfig, supabaseConfig } from './config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './supabase';

// ============================================
// TYPES
// ============================================

export interface SeatLockResult {
  success: boolean;
  lockId?: string;
  expiresAt?: number;
  error?: string;
  errorCode?: SeatLockErrorCode;
}

export interface SeatLockInfo {
  lockId: string;
  seatId: string;
  tripId: string;
  sessionId: string;
  lockedAt: number;
  expiresAt: number;
  isHeldByMe: boolean;
}

export type SeatLockErrorCode =
  | 'SEAT_ALREADY_LOCKED'
  | 'SEAT_ALREADY_BOOKED'
  | 'LOCK_CONTENTION'
  | 'MAX_LOCKS_EXCEEDED'
  | 'INVALID_SESSION'
  | 'LOCK_EXPIRED'
  | 'REDIS_ERROR'
  | 'DATABASE_ERROR';

// ============================================
// DISTRIBUTED LOCK IMPLEMENTATION
// ============================================

class DistributedLock {
  private redis: RedisClient;
  private config: ReturnType<typeof seatLockConfig>;
  private lockId: string | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly key: string,
    private readonly ttlMs: number,
    redis: RedisClient
  ) {
    this.redis = redis;
    this.config = seatLockConfig();
  }

  /**
   * Attempt to acquire the lock with retry logic
   */
  async acquire(retries: number = 3, delayMs: number = 100): Promise<boolean> {
    for (let attempt = 0; attempt < retries; attempt++) {
      const acquired = await this.tryAcquire();
      if (acquired) {
        // Start heartbeat to extend lock
        this.startHeartbeat();
        return true;
      }

      if (attempt < retries - 1) {
        // Wait before retry with exponential backoff
        const backoff = delayMs * Math.pow(2, attempt);
        await this.sleep(backoff);
      }
    }

    return false;
  }

  /**
   * Try to acquire lock atomically using SETNX
   */
  private async tryAcquire(): Promise<boolean> {
    const lockValue = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const acquired = await this.redis.setnx(this.key, lockValue, this.ttlMs);
    if (acquired) {
      this.lockId = lockValue;
    }
    return acquired;
  }

  /**
   * Release the lock (only if we hold it)
   */
  async release(): Promise<boolean> {
    if (!this.lockId) return false;

    this.stopHeartbeat();

    // Atomic release using Lua script would be better, but here's a safe approach
    const currentValue = await this.redis.get(this.key);
    if (currentValue === this.lockId) {
      await this.redis.del(this.key);
      this.lockId = null;
      return true;
    }

    // Lock was taken over or expired
    this.lockId = null;
    return false;
  }

  /**
   * Extend the lock TTL
   */
  async extend(additionalMs: number): Promise<boolean> {
    if (!this.lockId) return false;

    const currentValue = await this.redis.get(this.key);
    if (currentValue === this.lockId) {
      return this.redis.expire(this.key, additionalMs);
    }

    return false;
  }

  /**
   * Start heartbeat to keep lock alive
   */
  private startHeartbeat(): void {
    const heartbeatMs = this.ttlMs / 3;
    this.heartbeatInterval = setInterval(async () => {
      await this.extend(this.ttlMs);
    }, heartbeatMs);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Lua script for atomic seat lock operations
 * This runs on Redis server, ensuring no race conditions
 */
const ATOMIC_LOCK_SCRIPT = `
-- KEYS[1] = lock key
-- ARGV[1] = session_id
-- ARGV[2] = ttl_ms
-- ARGV[3] = max_locks_per_session
-- ARGV[4] = locks_set_key (for counting)

local lockKey = KEYS[1]
local sessionId = ARGV[1]
local ttlMs = tonumber(ARGV[2])
local maxLocks = tonumber(ARGV[3])
local locksSetKey = ARGV[4]

-- Check if seat is already locked or booked
local existingLock = redis.call('GET', lockKey)
if existingLock then
  -- Check if it's the same session
  local lockData = cjson.decode(existingLock)
  if lockData.sessionId == sessionId then
    -- Extend existing lock
    redis.call('PEXPIRE', lockKey, ttlMs)
    return {1, lockData.lockId, lockData.expiresAt}
  else
    -- Locked by another session
    return {0, 'SEAT_ALREADY_LOCKED', existingLock}
  end
end

-- Count existing locks for this session
local sessionLocksCount = redis.call('SCARD', locksSetKey)
if sessionLocksCount >= maxLocks then
  return {0, 'MAX_LOCKS_EXCEEDED', tostring(sessionLocksCount)}
end

-- Acquire new lock
local lockId = 'lock_' .. tostring(redis.call('INCR', 'mmbus:lock_counter'))
local expiresAt = tonumber(redis.call('TIME')[1]) * 1000 + tonumber(redis.call('TIME')[2]) / 1000 + ttlMs

local lockData = cjson.encode({
  lockId = lockId,
  sessionId = sessionId,
  lockedAt = tonumber(redis.call('TIME')[1]) * 1000,
  expiresAt = expiresAt
})

redis.call('SET', lockKey, lockData, 'PX', ttlMs)
redis.call('SADD', locksSetKey, lockKey)

return {1, lockId, tostring(expiresAt)}
`;

const ATOMIC_UNLOCK_SCRIPT = `
-- KEYS[1] = lock key
-- ARGV[1] = session_id
-- ARGV[2] = locks_set_key

local lockKey = KEYS[1]
local sessionId = ARGV[1]
local locksSetKey = ARGV[2]

local lockData = redis.call('GET', lockKey)
if not lockData then
  return {0, 'LOCK_NOT_FOUND'}
end

local decoded = cjson.decode(lockData)
if decoded.sessionId ~= sessionId then
  return {0, 'NOT_LOCK_OWNER'}
end

-- Check if lock has any bookings (would need database check)
-- For now, just remove

redis.call('DEL', lockKey)
redis.call('SREM', locksSetKey, lockKey)

return {1, 'RELEASED'}
`;

// ============================================
// SEAT LOCK SERVICE
// ============================================

export class SeatLockService {
  private redis: RedisClient;
  private config: ReturnType<typeof seatLockConfig>;
  private supabase: SupabaseClient<Database>;

  constructor() {
    this.redis = getRedis();
    this.config = seatLockConfig();
    this.supabase = createClient<Database>(
      supabaseConfig().url,
      supabaseConfig().serviceRoleKey || supabaseConfig().anonKey
    );
  }

  /**
   * Acquire seat lock with full race condition handling
   */
  async acquireLock(
    tripId: string,
    seatId: string,
    sessionId: string,
    durationMinutes?: number
  ): Promise<SeatLockResult> {
    const lockKey = `${this.config.redisLockPrefix}${tripId}:${seatId}`;
    const locksSetKey = `${this.config.redisLockPrefix}session:${sessionId}:locks`;
    const ttlMs = (durationMinutes || this.config.defaultDurationMinutes) * 60 * 1000;

    try {
      // First check database for booked status
      const { data: seat, error: seatError } = await this.supabase
        .from('seats')
        .select('status')
        .eq('id', seatId)
        .maybeSingle();

      if (seatError) {
        return {
          success: false,
          error: 'Database error checking seat status',
          errorCode: 'DATABASE_ERROR',
        };
      }

      if (seat && (seat as { status: string }).status === 'booked') {
        return {
          success: false,
          error: 'Seat is already booked',
          errorCode: 'SEAT_ALREADY_BOOKED',
        };
      }

      // Try to acquire distributed lock with retries
      const lock = new DistributedLock(lockKey, ttlMs, this.redis);
      const acquired = await lock.acquire(
        this.config.lockContentionRetries,
        this.config.lockContentionDelayMs
      );

      if (!acquired) {
        // Check if it's locked by us or someone else
        const existingLock = await this.redis.get(lockKey);
        if (existingLock) {
          const lockData = JSON.parse(existingLock);
          if (lockData.sessionId === sessionId) {
            // Already locked by us, extend it
            await this.redis.expire(lockKey, ttlMs);
            return {
              success: true,
              lockId: lockData.lockId,
              expiresAt: lockData.expiresAt,
            };
          } else {
            return {
              success: false,
              error: 'This seat was just locked by another user',
              errorCode: 'SEAT_ALREADY_LOCKED',
            };
          }
        }

        return {
          success: false,
          error: 'Could not acquire lock after retries',
          errorCode: 'LOCK_CONTENTION',
        };
      }

      // Check session lock count
      const lockCount = await this.redis.scard(locksSetKey);
      if (lockCount >= this.config.maxLocksPerSession) {
        await this.redis.del(lockKey);
        return {
          success: false,
          error: `Maximum ${this.config.maxLocksPerSession} seats can be selected at once`,
          errorCode: 'MAX_LOCKS_EXCEEDED',
        };
      }

      // Add to session locks set
      await this.redis.sadd(locksSetKey, lockKey);

      // Store lock metadata
      const lockId = `lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const expiresAt = Date.now() + ttlMs;

      const lockData = {
        lockId,
        seatId,
        tripId,
        sessionId,
        lockedAt: Date.now(),
        expiresAt,
      };

      await this.redis.set(lockKey, JSON.stringify(lockData), ttlMs);

      // Update database (best effort - Redis is source of truth)
      const { error: updateError } = await (this.supabase as any)
        .from('seat_locks')
        .upsert({
          seat_id: seatId,
          trip_id: tripId,
          session_id: sessionId,
          expires_at: new Date(expiresAt).toISOString(),
        });

      if (updateError) {
        console.error('[SeatLockService] Database update failed:', updateError);
        // Don't fail - Redis lock is the source of truth
      }

      return {
        success: true,
        lockId,
        expiresAt,
      };

    } catch (error) {
      console.error('[SeatLockService] Error acquiring lock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'REDIS_ERROR',
      };
    }
  }

  /**
   * Release seat lock
   */
  async releaseLock(
    tripId: string,
    seatId: string,
    sessionId: string
  ): Promise<SeatLockResult> {
    const lockKey = `${this.config.redisLockPrefix}${tripId}:${seatId}`;
    const locksSetKey = `${this.config.redisLockPrefix}session:${sessionId}:locks`;

    try {
      // Get existing lock
      const existingLock = await this.redis.get(lockKey);

      if (!existingLock) {
        return {
          success: false,
          error: 'No lock found',
          errorCode: 'LOCK_EXPIRED',
        };
      }

      const lockData = JSON.parse(existingLock);

      // Verify ownership
      if (lockData.sessionId !== sessionId) {
        return {
          success: false,
          error: 'You do not own this lock',
          errorCode: 'INVALID_SESSION',
        };
      }

      // Release lock
      await this.redis.del(lockKey);
      await this.redis.srem(locksSetKey, lockKey);

      // Update database (delete the lock record)
      await (this.supabase as any)
        .from('seat_locks')
        .delete()
        .eq('seat_id', seatId)
        .eq('trip_id', tripId)
        .eq('session_id', sessionId);

      return {
        success: true,
        lockId: lockData.lockId,
      };

    } catch (error) {
      console.error('[SeatLockService] Error releasing lock:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorCode: 'REDIS_ERROR',
      };
    }
  }

  /**
   * Get lock info
   */
  async getLockInfo(
    tripId: string,
    seatId: string,
    sessionId: string
  ): Promise<SeatLockInfo | null> {
    const lockKey = `${this.config.redisLockPrefix}${tripId}:${seatId}`;

    try {
      const lockData = await this.redis.get(lockKey);

      if (!lockData) {
        return null;
      }

      const lock = JSON.parse(lockData);

      return {
        lockId: lock.lockId,
        seatId: lock.seatId,
        tripId: lock.tripId,
        sessionId: lock.sessionId,
        lockedAt: lock.lockedAt,
        expiresAt: lock.expiresAt,
        isHeldByMe: lock.sessionId === sessionId,
      };

    } catch (error) {
      console.error('[SeatLockService] Error getting lock info:', error);
      return null;
    }
  }

  /**
   * Get all locks for a trip
   */
  async getTripLocks(tripId: string, sessionId: string): Promise<SeatLockInfo[]> {
    const pattern = `${this.config.redisLockPrefix}${tripId}:*`;

    try {
      const lockKeys = await this.redis.keys(pattern);
      const locks: SeatLockInfo[] = [];

      for (const key of lockKeys) {
        const lockData = await this.redis.get(key);
        if (lockData) {
          const lock = JSON.parse(lockData);
          locks.push({
            lockId: lock.lockId,
            seatId: lock.seatId,
            tripId: lock.tripId,
            sessionId: lock.sessionId,
            lockedAt: lock.lockedAt,
            expiresAt: lock.expiresAt,
            isHeldByMe: lock.sessionId === sessionId,
          });
        }
      }

      return locks;

    } catch (error) {
      console.error('[SeatLockService] Error getting trip locks:', error);
      return [];
    }
  }

  /**
   * Get all locks for current session
   */
  async getSessionLocks(tripId: string, sessionId: string): Promise<SeatLockInfo[]> {
    const locksSetKey = `${this.config.redisLockPrefix}session:${sessionId}:locks`;

    try {
      const lockKeys = await this.redis.smembers(locksSetKey);
      const locks: SeatLockInfo[] = [];

      for (const key of lockKeys) {
        // Filter to only this trip
        if (!key.includes(`:${tripId}:`)) continue;

        const lockData = await this.redis.get(key);
        if (lockData) {
          const lock = JSON.parse(lockData);
          locks.push({
            lockId: lock.lockId,
            seatId: lock.seatId,
            tripId: lock.tripId,
            sessionId: lock.sessionId,
            lockedAt: lock.lockedAt,
            expiresAt: lock.expiresAt,
            isHeldByMe: true,
          });
        }
      }

      return locks;

    } catch (error) {
      console.error('[SeatLockService] Error getting session locks:', error);
      return [];
    }
  }

  /**
   * Extend all session locks
   */
  async extendSessionLocks(
    tripId: string,
    sessionId: string,
    additionalMinutes?: number
  ): Promise<boolean> {
    const locksSetKey = `${this.config.redisLockPrefix}session:${sessionId}:locks`;
    const additionalMs = (additionalMinutes || this.config.defaultDurationMinutes) * 60 * 1000;

    try {
      const locks = await this.getSessionLocks(tripId, sessionId);
      const now = Date.now();

      for (const lock of locks) {
        // Only extend if not expired
        if (lock.expiresAt > now) {
          const lockKey = `${this.config.redisLockPrefix}${tripId}:${lock.seatId}`;
          await this.redis.expire(lockKey, additionalMs);
        }
      }

      return true;

    } catch (error) {
      console.error('[SeatLockService] Error extending locks:', error);
      return false;
    }
  }

  /**
   * Release all session locks
   */
  async releaseSessionLocks(tripId: string, sessionId: string): Promise<number> {
    const locksSetKey = `${this.config.redisLockPrefix}session:${sessionId}:locks`;

    try {
      const locks = await this.getSessionLocks(tripId, sessionId);
      let released = 0;

      for (const lock of locks) {
        const lockKey = `${this.config.redisLockPrefix}${tripId}:${lock.seatId}`;
        await this.redis.del(lockKey);
        await this.redis.srem(locksSetKey, lockKey);
        released++;
      }

      // Update database (delete the lock records)
      await (this.supabase as any)
        .from('seat_locks')
        .delete()
        .eq('trip_id', tripId)
        .eq('session_id', sessionId);

      return released;

    } catch (error) {
      console.error('[SeatLockService] Error releasing session locks:', error);
      return 0;
    }
  }

  /**
   * Cleanup expired locks (should run periodically)
   */
  async cleanupExpiredLocks(tripId?: string): Promise<number> {
    let cleaned = 0;

    try {
      const pattern = tripId
        ? `${this.config.redisLockPrefix}${tripId}:*`
        : `${this.config.redisLockPrefix}*`;

      const lockKeys = await this.redis.keys(pattern);
      const now = Date.now();

      for (const key of lockKeys) {
        // Skip session sets
        if (key.includes(':session:')) continue;

        const lockData = await this.redis.get(key);

        if (!lockData) {
          cleaned++;
          continue;
        }

        const lock = JSON.parse(lockData);

        if (lock.expiresAt < now) {
          await this.redis.del(key);

          // Remove from session set
          const sessionSetKey = `${this.config.redisLockPrefix}session:${lock.sessionId}:locks`;
          await this.redis.srem(sessionSetKey, key);

          // Update database (delete expired lock record)
          await (this.supabase as any)
            .from('seat_locks')
            .delete()
            .eq('seat_id', lock.seatId)
            .eq('trip_id', lock.tripId);

          cleaned++;
        }
      }

      return cleaned;

    } catch (error) {
      console.error('[SeatLockService] Error cleaning up locks:', error);
      return cleaned;
    }
  }

  /**
   * Convert dispute between two sessions trying to lock same seat
   * Uses Redis distributed lock to ensure only one wins
   */
  async resolveContention(
    tripId: string,
    seatId: string,
    sessionId1: string,
    sessionId2: string
  ): Promise<string | null> {
    const contentionKey = `${this.config.redisLockPrefix}contention:${tripId}:${seatId}`;

    try {
      // Use atomic SETNX to determine winner
      const winner = await this.redis.getSet(contentionKey, sessionId1, 5000);

      if (!winner) {
        // We won the contention
        return sessionId1;
      }

      // Someone else was already here
      return winner;

    } catch (error) {
      console.error('[SeatLockService] Resolving contention:', error);
      return null;
    }
  }
}

// ============================================
// SINGLETON EXPORT
// ============================================

let seatLockServiceInstance: SeatLockService | null = null;

export function getSeatLockService(): SeatLockService {
  if (!seatLockServiceInstance) {
    seatLockServiceInstance = new SeatLockService();
  }
  return seatLockServiceInstance;
}

export function resetSeatLockService(): void {
  seatLockServiceInstance = null;
}
