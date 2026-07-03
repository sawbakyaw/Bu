/**
 * Database Service Layer
 * ORM-like abstraction over Supabase with type-safe queries
 * Implements repository pattern, transactions, and caching
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig, redisConfig } from './config';
import { getRedis } from './redis-client';
import { logger, AppError, handleDatabaseError } from './logger';
import type { Database } from './supabase';

// ============================================
// TYPES
// ============================================

type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
// Update type is optional in some table definitions, use Partial<Row> as fallback
type UpdateTables<T extends keyof Database['public']['Tables']> =
  'Update' extends keyof Database['public']['Tables'][T]
    ? Database['public']['Tables'][T]['Update']
    : Partial<Database['public']['Tables'][T]['Row']>;

export interface QueryOptions {
  select?: string;
  filter?: Record<string, unknown>;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  single?: boolean;
  useCache?: boolean;
  cacheTtl?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export interface TransactionContext {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

// ============================================
// DATABASE CLIENT
// ============================================

class DatabaseService {
  private client: SupabaseClient<Database>;
  private adminClient: SupabaseClient<Database> | null = null;
  private redis: ReturnType<typeof getRedis> | null = null;

  constructor() {
    const config = supabaseConfig();

    this.client = createClient<Database>(config.url, config.anonKey, {
      db: { schema: 'public' },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Admin client for server-side operations
    if (config.serviceRoleKey) {
      this.adminClient = createClient<Database>(config.url, config.serviceRoleKey, {
        db: { schema: 'public' },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
    }

    try {
      if (redisConfig().enabled) {
        this.redis = getRedis();
      }
    } catch (error) {
      logger.warn('Redis not available for caching');
    }
  }

  /**
   * Get the appropriate client
   */
  getClient(useAdmin = false): SupabaseClient<Database> {
    if (useAdmin && this.adminClient) {
      return this.adminClient;
    }
    return this.client;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(table: string, options: QueryOptions): string {
    return `db:${table}:${JSON.stringify(options)}`;
  }

  /**
   * Execute a SELECT query with caching
   */
  async select<T extends keyof Database['public']['Tables']>(
    table: T,
    options: QueryOptions = {}
  ): Promise<Tables<T>[]> {
    try {
      // Check cache first
      if (options.useCache && this.redis) {
        const cacheKey = this.getCacheKey(table, options);
        const cached = await this.redis.get(cacheKey);

        if (cached) {
          try {
            return JSON.parse(cached) as Tables<T>[];
          } catch {
            // Invalid cache, continue with query
          }
        }
      }

      // Build query
      const client = this.getClient();
      const select = options.select || '*';

      let query = client.from(table).select(select, { count: 'exact' });

      // Apply filters
      if (options.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          if (value !== undefined && value !== null) {
            (query as any) = (query as any).eq(key as any, value as any);
          }
        }
      }

      // Apply ordering
      if (options.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? true,
        }) as any;
      }

      // Apply pagination
      if (options.limit) {
        query = query.limit(options.limit) as any;
      }

      if (options.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 10) - 1
        ) as any;
      }

      // Single result
      if (options.single) {
        query = query.maybeSingle() as any;
      }

      // Execute query
      const { data, error, count } = await query as any;

      if (error) {
        throw handleDatabaseError(error);
      }

      // Cache result
      if (options.useCache && this.redis && data) {
        const cacheKey = this.getCacheKey(table, options);
        await this.redis.set(cacheKey, JSON.stringify(data), options.cacheTtl || 60000);
      }

      return data as Tables<T>[];

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Get a single record by ID
   */
  async getById<T extends keyof Database['public']['Tables']>(
    table: T,
    id: string,
    options: { select?: string; useCache?: boolean } = {}
  ): Promise<Tables<T> | null> {
    const { select = '*' } = options;
    const client = this.getClient();

    try {
      // Check cache
      if (options.useCache && this.redis) {
        const cacheKey = `db:${table}:${id}`;
        const cached = await this.redis.get(cacheKey);

        if (cached) {
          return JSON.parse(cached) as Tables<T>;
        }
      }

      const { data, error } = await (client as any)
        .from(table)
        .select(select)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        throw handleDatabaseError(error);
      }

      // Cache
      if (options.useCache && this.redis && data) {
        const cacheKey = `db:${table}:${id}`;
        await this.redis.set(cacheKey, JSON.stringify(data), 60000);
      }

      return data as Tables<T> | null;

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Insert a record
   */
  async insert<T extends keyof Database['public']['Tables']>(
    table: T,
    data: InsertTables<T>
  ): Promise<Tables<T>> {
    const client = this.getClient(true);

    try {
      const { data: result, error } = await (client as any)
        .from(table)
        .insert(data)
        .select()
        .single();

      if (error) {
        throw handleDatabaseError(error);
      }

      // Invalidate cache
      await this.invalidateCache(table);

      return result as Tables<T>;

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Update a record
   */
  async update<T extends keyof Database['public']['Tables']>(
    table: T,
    id: string,
    data: UpdateTables<T>
  ): Promise<Tables<T>> {
    const client = this.getClient(true);

    try {
      const { data: result, error } = await (client as any)
        .from(table)
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw handleDatabaseError(error);
      }

      // Invalidate caches
      await this.invalidateCache(table as string, id);

      return result as Tables<T>;

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Delete a record
   */
  async delete<T extends keyof Database['public']['Tables']>(
    table: T,
    id: string
  ): Promise<boolean> {
    const client = this.getClient(true);

    try {
      const { error } = await (client as any)
        .from(table)
        .delete()
        .eq('id', id);

      if (error) {
        throw handleDatabaseError(error);
      }

      // Invalidate caches
      await this.invalidateCache(table as string, id);

      return true;

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Upsert a record
   */
  async upsert<T extends keyof Database['public']['Tables']>(
    table: T,
    data: InsertTables<T>,
    onConflict?: string
  ): Promise<Tables<T>> {
    const client = this.getClient(true);

    try {
      let query = (client as any).from(table).upsert(data).select().single();

      if (onConflict) {
        query = (client as any)
          .from(table)
          .upsert(data, { onConflict })
          .select()
          .single();
      }

      const { data: result, error } = await query;

      if (error) {
        throw handleDatabaseError(error);
      }

      await this.invalidateCache(table as string);

      return result as Tables<T>;

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Paginated query
   */
  async paginate<T extends keyof Database['public']['Tables']>(
    table: T,
    page: number = 1,
    pageSize: number = 20,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Tables<T>>> {
    const offset = (page - 1) * pageSize;

    const client = this.getClient();

    try {
      let query = (client as any)
        .from(table)
        .select(options.select || '*', { count: 'exact' });

      // Apply filters
      if (options.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          if (value !== undefined && value !== null) {
            (query as any) = (query as any).eq(key as any, value as any);
          }
        }
      }

      // Apply ordering
      if (options.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending ?? true,
        }) as any;
      }

      // Apply pagination
      query = query.range(offset, offset + pageSize - 1) as any;

      const { data, error, count } = await query as any;

      if (error) {
        throw handleDatabaseError(error);
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / pageSize);

      return {
        data: (data || []) as Tables<T>[],
        total,
        page,
        pageSize,
        totalPages,
        hasMore: page < totalPages,
      };

    } catch (error) {
      if (error instanceof AppError) throw error;
      throw handleDatabaseError(error);
    }
  }

  /**
   * Execute raw SQL
   */
  async raw<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const client = this.getClient(true);

    try {
      const { data, error } = await (client as any).rpc('execute_sql', {
        query: sql,
        params: params || [],
      });

      if (error) {
        throw handleDatabaseError(error);
      }

      return data as T[];

    } catch (error) {
      logger.logError('Raw SQL error', error as Error, { sql });
      throw handleDatabaseError(error);
    }
  }

  /**
   * Execute RPC function
   */
  async rpc<T = unknown>(
    fn: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const client = this.getClient(true);

    try {
      const { data, error } = await client.rpc(fn as any, params as any);

      if (error) {
        throw handleDatabaseError(error);
      }

      return data as T;

    } catch (error) {
      logger.logError('RPC error', error as Error, { fn });
      throw handleDatabaseError(error);
    }
  }

  /**
   * Invalidate cache for a table
   */
  private async invalidateCache(table: string, id?: string): Promise<void> {
    if (!this.redis) return;

    try {
      if (id) {
        const cacheKey = `db:${table}:${id}`;
        await this.redis.del(cacheKey);
      }

      // Invalidate queries for this table
      const pattern = `db:${table}:*`;
      const keys = await this.redis.keys(pattern);
      for (const key of keys) {
        await this.redis.del(key);
      }

    } catch (error) {
      logger.warn('Failed to invalidate cache', { table });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ database: boolean; latency: number }> {
    const start = Date.now();

    try {
      const client = this.getClient();
      const { error } = await client.from('cities').select('id').limit(1);

      return {
        database: !error,
        latency: Date.now() - start,
      };

    } catch {
      return {
        database: false,
        latency: Date.now() - start,
      };
    }
  }

  /**
   * Get connection statistics
   */
  getStats() {
    return {
      type: 'supabase',
      hasRedis: !!this.redis,
    };
  }
}

// ============================================
// REPOSITORIES
// ============================================

class TripRepository {
  constructor(private db: DatabaseService) {}

  async findById(
    tripId: string,
    options: { useCache?: boolean } = {}
  ): Promise<Tables<'trips'> | null> {
    return this.db.getById('trips', tripId, {
      ...options,
      select: `
        *,
        operators (*),
        buses (*),
        routes!inner (
          id,
          from_city_id,
          to_city_id,
          estimated_duration_minutes
        )
      `,
    });
  }

  async findByRouteAndDate(
    fromCityId: string,
    toCityId: string,
    date: string,
    options: { useCache?: boolean; limit?: number } = {}
  ): Promise<Tables<'trips'>[]> {
    return this.db.select('trips', {
      ...options,
      filter: {
        'routes.from_city_id': fromCityId,
        'routes.to_city_id': toCityId,
      },
      order: { column: 'departure_time', ascending: true },
    });
  }

  async updateAvailableSeats(
    tripId: string,
    delta: number
  ): Promise<boolean> {
    try {
      const client = this.db.getClient(true);
      const { error } = await (client as any).rpc('update_available_seats', {
        trip_uuid: tripId,
        seat_delta: delta,
      });

      return !error;

    } catch (error) {
      logger.logError('Failed to update available seats', error as Error, {
        tripId,
        delta,
      });
      return false;
    }
  }
}

class BookingRepository {
  constructor(private db: DatabaseService) {}

  async findByReference(reference: string): Promise<Tables<'bookings'> | null> {
    return this.db.getById('bookings', reference);
  }

  async create(
    booking: InsertTables<'bookings'>
  ): Promise<Tables<'bookings'>> {
    return this.db.insert('bookings', booking);
  }

  async confirmPayment(
    bookingId: string,
    paymentReference: string
  ): Promise<Tables<'bookings'>> {
    return this.db.update('bookings', bookingId, {
      payment_status: 'paid',
      payment_reference: paymentReference,
    } as UpdateTables<'bookings'>);
  }
}

class SeatRepository {
  constructor(private db: DatabaseService) {}

  async findByTrip(tripId: string): Promise<Tables<'seats'>[]> {
    return this.db.select('seats', {
      filter: { trip_id: tripId },
      order: { column: 'row_number', ascending: true },
    });
  }

  async updateSeatStatus(
    seatId: string,
    status: 'available' | 'locked' | 'booked'
  ): Promise<Tables<'seats'>> {
    return this.db.update('seats', seatId, {
      status,
    } as UpdateTables<'seats'>);
  }
}

// ============================================
// EXPORTS
// ============================================

let dbServiceInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbServiceInstance) {
    dbServiceInstance = new DatabaseService();
  }
  return dbServiceInstance;
}

export function getTripRepository(): TripRepository {
  return new TripRepository(getDatabase());
}

export function getBookingRepository(): BookingRepository {
  return new BookingRepository(getDatabase());
}

export function getSeatRepository(): SeatRepository {
  return new SeatRepository(getDatabase());
}

export function resetDatabase(): void {
  dbServiceInstance = null;
}

// Types are already exported above, no need for re-export
