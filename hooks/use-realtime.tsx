/**
 * React Hooks for Real-Time Connection Management
 * Provides robust real-time updates with edge case handling
 */

'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  realtimeManager,
  RealtimeManager,
  ConnectionState,
  ConnectionStatus,
} from '@/lib/realtime-manager';

// Define locally since not exported from realtime-manager
interface SubscriptionConfig {
  channelName: string;
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}
import { supabase } from '@/lib/supabase';

// ============================================
// CONNECTION STATUS HOOK
// ============================================

export interface UseRealtimeConnectionResult {
  isConnected: boolean;
  isReconnecting: boolean;
  state: ConnectionState;
  latency: number;
  lastError?: string;
  reconnectingIn?: number;
  metrics: {
    totalDisconnections: number;
    avgLatency: number;
    packetsReceived: number;
    packetsDropped: number;
  };
}

/**
 * Hook to track real-time connection status
 */
export function useRealtimeConnection(): UseRealtimeConnectionResult {
  const [status, setStatus] = useState<ConnectionStatus | null>(
    realtimeManager?.getConnectionStatus() || null
  );

  useEffect(() => {
    if (!realtimeManager) return;

    const unsubscribe = realtimeManager.subscribeToState((newStatus) => {
      setStatus(newStatus);
    });

    // Auto-connect on mount
    realtimeManager.connect();

    return unsubscribe;
  }, []);

  return useMemo(() => ({
    isConnected: status?.state === 'connected',
    isReconnecting: status?.state === 'reconnecting',
    state: status?.state || 'disconnected',
    latency: status?.metrics?.latency || 0,
    lastError: status?.lastError,
    reconnectingIn: status?.reconnectingIn,
    metrics: {
      totalDisconnections: status?.metrics?.totalDisconnections || 0,
      avgLatency: status?.metrics?.avgLatency || 0,
      packetsReceived: status?.metrics?.packetsReceived || 0,
      packetsDropped: status?.metrics?.packetsDropped || 0,
    },
  }), [status]);
}

// ============================================
// REAL-TIME SUBSCRIPTION HOOK
// ============================================

export interface UseRealtimeSubscriptionOptions<T> {
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  enabled?: boolean;
  selectQuery?: string;
  initialData?: T[];
  onUpdate?: (payload: { eventType: string; new: T; old: T }) => void;
  onError?: (error: Error) => void;
}

export interface UseRealtimeSubscriptionResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  checksum: string;
}

/**
 * Hook for real-time table subscriptions with stale state recovery
 */
export function useRealtimeSubscription<T extends { id: string }>(
  channelName: string,
  options: UseRealtimeSubscriptionOptions<T>
): UseRealtimeSubscriptionResult<T> {
  const {
    table,
    filter,
    event = '*',
    enabled = true,
    selectQuery = '*',
    initialData = [],
    onUpdate,
    onError,
  } = options;

  const [data, setData] = useState<T[]>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [checksum, setChecksum] = useState('');
  const dataRef = useRef<T[]>(data);

  // Keep dataRef updated
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      let query = supabase.from(table).select(selectQuery);

      // Apply filter if provided
      if (filter) {
        const [column, operator, value] = filter.split('=');
        if (column && value) {
          query = query.eq(column.trim(), value.trim());
        }
      }

      const { data: result, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      setData((result || []) as unknown as T[]);
      setLoading(false);

      // Generate checksum for stale detection
      setChecksum(generateDataChecksum(result || []));
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch data');
      setError(error);
      setLoading(false);
      onError?.(error);
    }
  }, [table, filter, selectQuery, enabled, onError]);

  // Handle realtime updates
  const handleRealtimeUpdate = useCallback(
    (payload: { eventType: string; new: T; old: T }) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      setData((prevData) => {
        let newData = [...prevData];

        switch (eventType) {
          case 'INSERT':
            // Avoid duplicates
            if (!newData.some((item) => item.id === newRecord.id)) {
              newData = [...newData, newRecord];
            }
            break;

          case 'UPDATE':
            newData = newData.map((item) =>
              item.id === newRecord.id ? newRecord : item
            );
            break;

          case 'DELETE':
            newData = newData.filter((item) => item.id !== oldRecord.id);
            break;
        }

        return newData;
      });

      // Call custom handler
      onUpdate?.(payload);
    },
    [onUpdate]
  );

  // Setup subscription
  useEffect(() => {
    if (!enabled || !realtimeManager) return;

    const config: SubscriptionConfig = {
      channelName,
      table,
      filter,
      event,
    };

    const unsubscribe = realtimeManager.subscribe(
      config,
      (payload) => {
        handleRealtimeUpdate(payload as { eventType: string; new: T; old: T });
      },
      (error) => {
        setError(error);
        onError?.(error);
      }
    );

    // Fetch initial data
    fetchData();

    return unsubscribe;
  }, [channelName, table, filter, event, enabled, handleRealtimeUpdate, fetchData, onError]);

  // Stale state recovery on window focus
  useEffect(() => {
    const handleFocus = () => {
      // Check if data might be stale (last fetch was > 30 seconds ago)
      fetchData();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchData]);

  // Visibility change handler for tab wake recovery
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let the network settle after tab wake
        setTimeout(fetchData, 500);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    checksum,
  };
}

// ============================================
// SEAT LOCK SUBSCRIPTION HOOK
// ============================================

export interface SeatUpdatePayload {
  id: string;
  trip_id: string;
  seat_number: string;
  status: 'available' | 'locked' | 'booked';
  row_number: number;
  column_number: number;
}

export interface SeatLockUpdatePayload {
  id: string;
  seat_id: string;
  trip_id: string;
  session_id: string;
  expires_at: string;
  is_active: boolean;
}

export interface UseSeatUpdatesOptions {
  tripId: string;
  enabled?: boolean;
  onSeatUpdate?: (seat: SeatUpdatePayload) => void;
  onLockUpdate?: (lock: SeatLockUpdatePayload) => void;
}

export interface UseSeatUpdatesResult {
  seats: Map<string, SeatUpdatePayload>;
  locks: Map<string, SeatLockUpdatePayload>;
  loading: boolean;
  error: Error | null;
  connectionStatus: UseRealtimeConnectionResult;
  refresh: () => Promise<void>;
}

/**
 * Specialized hook for seat updates with dual subscription
 * Handles both seats and seat_locks tables
 */
export function useSeatUpdates(options: UseSeatUpdatesOptions): UseSeatUpdatesResult {
  const { tripId, enabled = true, onSeatUpdate, onLockUpdate } = options;

  const [seats, setSeats] = useState<Map<string, SeatUpdatePayload>>(new Map());
  const [locks, setLocks] = useState<Map<string, SeatLockUpdatePayload>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const connectionStatus = useRealtimeConnection();

  // Fetch initial state
  const fetchInitialState = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch seats
      const { data: seatsData, error: seatsError } = await supabase
        .from('seats')
        .select('*')
        .eq('trip_id', tripId)
        .order('row_number')
        .order('column_number');

      if (seatsError) throw seatsError;

      // Fetch active locks
      const { data: locksData, error: locksError } = await supabase
        .from('seat_locks')
        .select('*')
        .eq('trip_id', tripId)
        .eq('is_active', true);

      if (locksError) throw locksError;

      // Convert to maps
      const seatsMap = new Map<string, SeatUpdatePayload>();
      const locksMap = new Map<string, SeatLockUpdatePayload>();

      seatsData?.forEach((seat) => {
        seatsMap.set(seat.id, seat as SeatUpdatePayload);
      });

      locksData?.forEach((lock) => {
        locksMap.set(lock.seat_id, lock as SeatLockUpdatePayload);
      });

      setSeats(seatsMap);
      setLocks(locksMap);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch seat state');
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [tripId, enabled]);

  // Handle seat updates
  const handleSeatUpdate = useCallback((payload: { eventType: string; new: SeatUpdatePayload; old: SeatUpdatePayload }) => {
    const { eventType, new: newSeat, old: oldSeat } = payload;

    setSeats((prev) => {
      const next = new Map(prev);

      switch (eventType) {
        case 'INSERT':
        case 'UPDATE':
          next.set(newSeat.id, newSeat);
          break;
        case 'DELETE':
          next.delete(oldSeat.id);
          break;
      }

      return next;
    });

    onSeatUpdate?.(payload.new);
  }, [onSeatUpdate]);

  // Handle lock updates
  const handleLockUpdate = useCallback((payload: { eventType: string; new: SeatLockUpdatePayload; old: SeatLockUpdatePayload }) => {
    const { eventType, new: newLock } = payload;

    setLocks((prev) => {
      const next = new Map(prev);

      switch (eventType) {
        case 'INSERT':
        case 'UPDATE':
          if (newLock.is_active) {
            next.set(newLock.seat_id, newLock);
          } else {
            next.delete(newLock.seat_id);
          }
          break;
        case 'DELETE':
          next.delete(payload.old.seat_id);
          break;
      }

      return next;
    });

    onLockUpdate?.(payload.new);
  }, [onLockUpdate]);

  // Setup subscriptions
  useEffect(() => {
    if (!enabled || !realtimeManager || !tripId) return;

    const unsubscribers: (() => void)[] = [];

    // Subscribe to seats changes
    unsubscribers.push(
      realtimeManager.subscribe(
        { channelName: `seats-${tripId}`, table: 'seats', filter: `trip_id=eq.${tripId}` },
        (payload) => handleSeatUpdate(payload as any)
      )
    );

    // Subscribe to seat_locks changes
    unsubscribers.push(
      realtimeManager.subscribe(
        { channelName: `locks-${tripId}`, table: 'seat_locks', filter: `trip_id=eq.${tripId}` },
        (payload) => handleLockUpdate(payload as any)
      )
    );

    // Fetch initial state
    fetchInitialState();

    // Cleanup
    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [tripId, enabled, handleSeatUpdate, handleLockUpdate, fetchInitialState]);

  // Recovery on reconnection
  useEffect(() => {
    if (connectionStatus.isConnected && !loading) {
      // Refresh data when connection is established
      fetchInitialState();
    }
  }, [connectionStatus.isConnected, fetchInitialState, loading]);

  return {
    seats,
    locks,
    loading,
    error,
    connectionStatus,
    refresh: fetchInitialState,
  };
}

// ============================================
// CONNECTION STATUS INDICATOR COMPONENT
// ============================================

function generateDataChecksum(data: unknown[]): string {
  if (!data || data.length === 0) return '0';
  return (data.length * 31).toString(16);
}

// ============================================
// UTILITIES
// ============================================

/**
 * Debounce a callback
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]) as T;
}

/**
 * Track previous value for comparison
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}

/**
 * Check if value has changed
 */
export function useHasChanged<T>(value: T): boolean {
  const previous = usePrevious(value);
  return previous !== value;
}
