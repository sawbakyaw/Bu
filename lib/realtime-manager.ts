/**
 * Production-Grade Real-Time Connection Manager
 * Handles WebSockets/SSE with robust edge case handling
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

// ============================================
// TYPES
// ============================================

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error'
  | 'suspended';

export interface ConnectionMetrics {
  latency: number;
  reconnectAttempts: number;
  lastHeartbeat: number;
  totalDisconnections: number;
  avgLatency: number;
  packetsReceived: number;
  packetsDropped: number;
}

export interface ConnectionStatus {
  state: ConnectionState;
  isOnline: boolean;
  metrics: ConnectionMetrics;
  lastError?: string;
  reconnectingIn?: number;
}

interface SubscriptionConfig {
  channelName: string;
  table: string;
  filter?: string;
  event?: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
}

interface QueuedUpdate {
  timestamp: number;
  payload: unknown;
  retryCount: number;
}

// Reconnection configuration
const RECONNECT_CONFIG = {
  initialDelay: 1000,
  maxDelay: 60000,
  baseMultiplier: 2,
  maxAttempts: 10,
  jitterMax: 0.25, // 25% jitter
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
  debounceWindow: 100, // ms to batch updates
};

// ============================================
// REALTIME MANAGER CLASS
// ============================================

class RealtimeManager {
  private static instance: RealtimeManager | null = null;
  private client: SupabaseClient;
  private channels: Map<string, RealtimeChannel> = new Map();
  private connectionState: ConnectionState = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private latencyHistory: number[] = [];
  private stateListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private subscriptions: Map<string, Set<(payload: unknown) => void>> = new Map();
  private pendingOperations: Array<() => Promise<void>> = [];
  private updateQueue: Map<string, QueuedUpdate[]> = new Map();
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private metrics: ConnectionMetrics;
  private isShuttingDown = false;
  private visibilityChangeHandler: () => void;
  private onlineChangeHandler: () => void;
  private boundVisibilityChange: () => void;
  private boundOnlineChange: () => void;
  private beforeUnloadHandler: () => void;

  private constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.client = createClient(supabaseUrl, supabaseKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
        heartbeatIntervalMs: RECONNECT_CONFIG.heartbeatInterval,
        logger: (kind: string, msg: string, data: unknown) => {
          if (process.env.NODE_ENV === 'development') {
            console.log(`[Realtime ${kind}]`, msg, data);
          }
        },
      },
    });

    this.metrics = this.createInitialMetrics();

    // Bind handlers
    this.visibilityChangeHandler = this.handleVisibilityChange.bind(this);
    this.onlineChangeHandler = this.handleOnlineChange.bind(this);
    this.beforeUnloadHandler = this.handleBeforeUnload.bind(this);
    this.boundVisibilityChange = this.visibilityChangeHandler;
    this.boundOnlineChange = this.onlineChangeHandler;

    // Setup global event listeners
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
      window.addEventListener('online', this.boundOnlineChange);
      window.addEventListener('offline', this.boundOnlineChange);
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }

  static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager();
    }
    return RealtimeManager.instance;
  }

  static destroyInstance(): void {
    if (RealtimeManager.instance) {
      RealtimeManager.instance.destroy();
      RealtimeManager.instance = null;
    }
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }

    this.updateState('connecting');
    this.clearTimeouts();

    try {
      await this.testConnection();
      this.onConnected();
    } catch (error) {
      this.onConnectionError(error);
    }
  }

  private async testConnection(): Promise<void> {
    // Test connection with timeout
    const timeout = RECONNECT_CONFIG.connectionTimeout;

    const result = await Promise.race([
      this.client.from('cities').select('id').limit(1),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), timeout)
      ),
    ]);

    if (result === null) {
      throw new Error('Connection timeout');
    }
  }

  private onConnected(): void {
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.lastHeartbeat = Date.now();
    this.startHeartbeat();
    this.flushPendingOperations();
    this.updateState('connected');

    // Resubscribe to all channels
    this.resubscribeAll();
  }

  private onConnectionError(error: unknown): void {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RealtimeManager] Connection error:', errorMsg);

    this.metrics.totalDisconnections++;
    this.updateState('error', errorMsg);

    // Attempt reconnection if not shutting down
    if (!this.isShuttingDown) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
      this.updateState('suspended', 'Max reconnection attempts reached');
      return;
    }

    const delay = this.calculateBackoffDelay();
    this.updateState('reconnecting', undefined, Math.ceil(delay / 1000));

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;
      await this.connect();
    }, delay);
  }

  private calculateBackoffDelay(): number {
    const { initialDelay, maxDelay, baseMultiplier, jitterMax } = RECONNECT_CONFIG;
    const attempt = this.reconnectAttempts;

    // Exponential backoff
    let delay = initialDelay * Math.pow(baseMultiplier, attempt);

    // Cap at max delay
    delay = Math.min(delay, maxDelay);

    // Add jitter (random percentage up to jitterMax)
    const jitter = delay * (Math.random() * jitterMax);
    delay = delay + jitter;

    return Math.floor(delay);
  }

  disconnect(): void {
    this.clearTimeouts();
    this.stopHeartbeat();
    this.removeAllChannels();
    this.updateState('disconnected');
  }

  destroy(): void {
    this.isShuttingDown = true;
    this.disconnect();

    // Remove global event listeners
    if (typeof window !== 'undefined') {
      document.removeEventListener('visibilitychange', this.boundVisibilityChange);
      window.removeEventListener('online', this.boundOnlineChange);
      window.removeEventListener('offline', this.boundOnlineChange);
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }

    this.stateListeners.clear();
    this.subscriptions.clear();
    this.channels.clear();
  }

  // ============================================
  // HEARTBEAT & HEALTH CHECKS
  // ============================================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, RECONNECT_CONFIG.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private async checkConnectionHealth(): Promise<void> {
    const now = Date.now();
    const timeSinceLastHeartbeat = now - this.lastHeartbeat;

    // If no heartbeat for 2x interval, consider connection stale
    if (timeSinceLastHeartbeat > RECONNECT_CONFIG.heartbeatInterval * 2) {
      console.warn('[RealtimeManager] Connection stale, reconnecting...');
      this.disconnect();
      await this.connect();
      return;
    }

    // Measure latency
    const start = Date.now();
    try {
      await this.testConnection();
      this.recordLatency(Date.now() - start);
    } catch {
      // Connection lost
      this.onConnectionError(new Error('Health check failed'));
    }
  }

  private recordLatency(latency: number): void {
    this.latencyHistory.push(latency);
    if (this.latencyHistory.length > 10) {
      this.latencyHistory.shift();
    }
    this.metrics.latency = latency;
    this.metrics.avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;
    this.lastHeartbeat = Date.now();
  }

  // ============================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================

  subscribe(
    config: SubscriptionConfig,
    callback: (payload: unknown) => void,
    onError?: (error: Error) => void
  ): () => void {
    const { channelName, table, filter, event = '*' } = config;

    // Add to subscriptions map
    if (!this.subscriptions.has(channelName)) {
      this.subscriptions.set(channelName, new Set());
    }
    this.subscriptions.get(channelName)!.add(callback);

    // Create or get channel
    let channel = this.channels.get(channelName);

    if (!channel) {
      channel = this.client.channel(channelName, {
        config: {
          broadcast: { ack: true },
          presence: { key: '' },
        },
      });

      // Add postgres changes listener
      channel.on(
        'postgres_changes' as any,
        {
          event: event,
          schema: 'public',
          table: table,
          filter: filter,
        },
        (payload: unknown) => {
          this.handleSubscriptionUpdate(channelName, payload);
        }
      );

      // Track subscribe state
      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.metrics.packetsReceived++;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.metrics.packetsDropped++;
          if (onError) {
            onError(new Error(`Channel ${channelName} error: ${status}`));
          }
          // Attempt to resubscribe
          this.resubscribeChannel(channelName);
        }
      });

      this.channels.set(channelName, channel);
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(channelName, callback);
    };
  }

  private handleSubscriptionUpdate(channelName: string, payload: unknown): void {
    // Debounce rapid updates
    this.debounceUpdate(channelName, payload);
  }

  private debounceUpdate(channelName: string, payload: unknown): void {
    // Add to queue
    if (!this.updateQueue.has(channelName)) {
      this.updateQueue.set(channelName, []);
    }
    this.updateQueue.get(channelName)!.push({
      timestamp: Date.now(),
      payload,
      retryCount: 0,
    });

    // Clear existing timer
    if (this.debounceTimers.has(channelName)) {
      clearTimeout(this.debounceTimers.get(channelName)!);
    }

    // Set new timer
    this.debounceTimers.set(
      channelName,
      setTimeout(() => {
        this.flushUpdateQueue(channelName);
      }, RECONNECT_CONFIG.debounceWindow)
    );
  }

  private flushUpdateQueue(channelName: string): void {
    const queue = this.updateQueue.get(channelName);
    if (!queue || queue.length === 0) return;

    // Get the latest payload (last in queue)
    const latestUpdate = queue[queue.length - 1];

    // Notify all subscribers
    const callbacks = this.subscriptions.get(channelName);
    if (callbacks) {
      const cbArray = Array.from(callbacks);
      for (const callback of cbArray) {
        try {
          callback(latestUpdate.payload);
        } catch (error) {
          console.error('[RealtimeManager] Callback error:', error);
        }
      }
    }

    // Clear queue
    this.updateQueue.set(channelName, []);
    this.debounceTimers.delete(channelName);
  }

  private unsubscribe(channelName: string, callback: (payload: unknown) => void): void {
    const callbacks = this.subscriptions.get(channelName);
    if (callbacks) {
      callbacks.delete(callback);

      // If no more callbacks, remove channel
      if (callbacks.size === 0) {
        this.removeChannel(channelName);
        this.subscriptions.delete(channelName);
      }
    }
  }

  private removeChannel(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      this.client.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }

  private removeAllChannels(): void {
    const channelNames = Array.from(this.channels.keys());
    for (const channelName of channelNames) {
      this.removeChannel(channelName);
    }
  }

  private resubscribeChannel(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      setTimeout(() => {
        channel.subscribe();
      }, 1000);
    }
  }

  private resubscribeAll(): void {
    const subEntries = Array.from(this.subscriptions.entries());
    for (const [channelName, callbacks] of subEntries) {
      if (callbacks.size > 0) {
        this.resubscribeChannel(channelName);
      }
    }
  }

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  private updateState(
    state: ConnectionState,
    error?: string,
    reconnectingIn?: number
  ): void {
    this.connectionState = state;

    const status: ConnectionStatus = {
      state,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      metrics: { ...this.metrics },
      lastError: error,
      reconnectingIn,
    };

    for (const listener of Array.from(this.stateListeners)) {
      try {
        listener(status);
      } catch (err) {
        console.error('[RealtimeManager] Listener error:', err);
      }
    }
  }

  subscribeToState(listener: (status: ConnectionStatus) => void): () => void {
    this.stateListeners.add(listener);

    // Immediately notify of current state
    listener({
      state: this.connectionState,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      metrics: { ...this.metrics },
    });

    return () => {
      this.stateListeners.delete(listener);
    };
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') {
      // Tab became visible, check connection
      if (this.connectionState !== 'connected') {
        this.connect();
      } else {
        // Verify connection is healthy
        this.checkConnectionHealth();
      }
    }
  }

  private handleOnlineChange(): void {
    if (navigator.onLine) {
      // Back online, reconnect
      this.connect();
    } else {
      // Gone offline
      this.updateState('disconnected', 'Network offline');
      this.clearTimeouts();
    }
  }

  private handleBeforeUnload(): void {
    // Persist state before unload
    this.persistState();
  }

  private persistState(): void {
    if (typeof sessionStorage === 'undefined') return;

    try {
      sessionStorage.setItem(
        'realtime_state',
        JSON.stringify({
          lastHeartbeat: this.lastHeartbeat,
          reconnectAttempts: this.reconnectAttempts,
          channels: Array.from(this.subscriptions.keys()),
        })
      );
    } catch (error) {
      // Ignore storage errors
    }
  }

  private loadPersistedState(): { channels: string[] } | null {
    if (typeof sessionStorage === 'undefined') return null;

    try {
      const stored = sessionStorage.getItem('realtime_state');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  // ============================================
  // OPERATIONS QUEUE (FOR OFFLINE SUPPORT)
  // ============================================

  queueOperation(operation: () => Promise<void>): void {
    if (this.connectionState === 'connected') {
      operation();
    } else {
      this.pendingOperations.push(operation);
    }
  }

  private flushPendingOperations(): void {
    const operations = this.pendingOperations;
    this.pendingOperations = [];

    for (const operation of operations) {
      operation();
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private clearTimeouts(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private createInitialMetrics(): ConnectionMetrics {
    return {
      latency: 0,
      reconnectAttempts: 0,
      lastHeartbeat: Date.now(),
      totalDisconnections: 0,
      avgLatency: 0,
      packetsReceived: 0,
      packetsDropped: 0,
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return {
      state: this.connectionState,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      metrics: { ...this.metrics },
    };
  }

  // ============================================
  // STALE STATE RECOVERY
  // ============================================

  async fetchFreshState<T>(
    tableName: string,
    query: Record<string, unknown>,
    checksum?: string
  ): Promise<{ data: T | null; checksum: string; isStale: boolean }> {
    const { data, error } = await this.client
      .from(tableName)
      .select('*')
      .match(query as Record<string, unknown>);

    if (error) {
      throw error;
    }

    // Generate checksum
    const newChecksum = this.generateChecksum(JSON.stringify(data));
    const isStale = checksum ? checksum !== newChecksum : false;

    return {
      data: data as T,
      checksum: newChecksum,
      isStale,
    };
  }

  private generateChecksum(data: string): string {
    // Simple hash for checksum
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

// ============================================
// EXPORTS
// ============================================

export const realtimeManager = typeof window !== 'undefined'
  ? RealtimeManager.getInstance()
  : null;

export { RealtimeManager };
