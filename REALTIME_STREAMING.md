# Production-Grade Real-Time Streaming Controller

## Overview

This document describes a robust, production-grade real-time streaming system with comprehensive edge case handling, auto-reconnection, stale state recovery, and memory leak prevention.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Application Layer                             │
│  (useRealtimeConnection, useSeatUpdates, useRealtimeSubscription)│
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                  RealtimeManager (Singleton)                     │
│  - Connection State Machine                                       │
│  - Exponential Backoff Reconnection                               │
│  - Heartbeat & Health Monitoring                                  │
│  - Subscription Registry                                          │
│  - Update Debouncing & Batching                                   │
│  - Stale State Recovery                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│              Supabase Realtime Client (WebSocket)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. RealtimeManager (`lib/realtime-manager.ts`)

Singleton class managing all real-time connections and subscriptions.

**Key Features**:
- Connection state machine: `connecting | connected | disconnected | reconnecting | error | suspended`
- Exponential backoff with jitter for reconnection
- Heartbeat monitoring (30-second intervals)
- Subscription registry with automatic cleanup
- Update debouncing (100ms window)
- Stale state recovery with checksums
- Pending operations queue for offline support

**Methods**:

```typescript
// Get singleton instance
const manager = RealtimeManager.getInstance();

// Connect to realtime server
await manager.connect();

// Subscribe to table changes
const unsubscribe = manager.subscribe(
  { channelName: 'seats-trip-123', table: 'seats', filter: 'trip_id=eq.123' },
  (payload) => console.log(payload),
  (error) => console.error(error)
);

// Track connection status
manager.subscribeToStatus((status) => {
  console.log(status.state, status.metrics.latency);
});

// Disconnect and cleanup
manager.disconnect();
manager.destroy();
```

### 2. React Hooks (`hooks/use-realtime.tsx`)

#### useRealtimeConnection

Track real-time connection status:

```typescript
const connection = useRealtimeConnection();
// {
//   isConnected: boolean,
//   isReconnecting: boolean,
//   state: ConnectionState,
//   latency: number,
//   lastError?: string,
//   metrics: { totalDisconnections, avgLatency, packetsReceived, packetsDropped }
// }
```

#### useSeatUpdates

Specialized hook for seat and lock updates:

```typescript
const { seats, locks, loading, error, connectionStatus, refresh } = useSeatUpdates({
  tripId: 'trip-uuid',
  enabled: true,
  onSeatUpdate: (seat) => console.log('Seat updated:', seat),
  onLockUpdate: (lock) => console.log('Lock updated:', lock),
});
```

#### useRealtimeSubscription

Generic hook for any table subscription:

```typescript
const { data, loading, error, refresh } = useRealtimeSubscription<Message[]>(
  'messages-channel',
  {
    table: 'messages',
    filter: 'conversation_id=eq.123',
    enabled: true,
    onUpdate: (payload) => console.log('Update:', payload),
  }
);
```

### 3. UI Components (`components/connection-status-indicator.tsx`)

- `ConnectionStatusIndicator` - Small dot showing connection quality
- `ConnectionBanner` - Full-screen banner for offline/reconnecting
- `ConnectionStatusPanel` - Admin panel with detailed metrics
- `ConnectionToast` - Pop-up notification for state changes

---

## Edge Case Handling

### 1. Sudden Client Disconnection

**Detection**:
- WebSocket close event
- Failed health checks
- Browser `offline` event

**Handling**:
```typescript
// Connection state changes to 'disconnected'
// Pending operations are queued
// UI shows reconnecting indicator
connectionState = 'disconnected';
queueOperations(pendingOps);
showReconnectingUI();
```

**Recovery**:
- Automatic reconnection attempt with exponential backoff
- All subscriptions are remembered and resubscribed on reconnect

### 2. Network Latency Spikes

**Detection**:
- Each heartbeat tracks latency
- Latency history maintained (last 10 samples)
- Average latency calculated

**Handling**:
```typescript
// High latency triggers warning state
if (latency > 300) {
  showWarningIndicator(); // Yellow status
}
if (latency > 1000) {
  showErrorIndicator(); // Red status
}
```

**UI Feedback**:
- Status indicator changes color based on latency
- Latency value shown in status panel
- Toast notification for significant latency changes

### 3. Auto-Reconnection Backoff Strategy

**Algorithm**:
```typescript
// Exponential backoff with jitter
delay = initialDelay * (2 ^ attempt)  // 1s → 2s → 4s → 8s → 16s → 32s → 60s (max)
jitter = delay * random(0, 0.25)      // Add up to 25% random jitter
finalDelay = delay + jitter
```

**Configuration**:
```typescript
const RECONNECT_CONFIG = {
  initialDelay: 1000,      // Start with 1 second
  maxDelay: 60000,         // Max 60 seconds
  maxAttempts: 10,         // Give up after 10 attempts
  jitterMax: 0.25,         // 25% jitter
  heartbeatInterval: 30000 // Health check every 30s
};
```

**States**:
1. `connecting` → Initial connection attempt
2. `error` → Connection failed, scheduling reconnect
3. `reconnecting` → Waiting `reconnectingIn` seconds
4. Connected or `suspended` if max attempts reached

### 4. Stale State Recovery

**Problem**: While disconnected, other users may have booked seats. On reconnect, the client has stale state.

**Solution**: Full state refresh with checksum validation:

```typescript
// On reconnect, fetch fresh state
async fetchFreshState() {
  const { data, checksum } = await manager.fetchFreshState(
    'seats',
    { trip_id: tripId },
    previousChecksum
  );

  if (previousChecksum !== checksum) {
    // State changed while disconnected
    showNotification('Seat availability updated');
    updateUI(data);
  }
}
```

**Triggers for Recovery**:
1. Connection re-established after disconnection
2. Tab becomes visible (`visibilitychange` event)
3. Window gains focus (`focus` event)
4. Browser comes online (`online` event)

### 5. Memory Leak Prevention

**Cleanup on Unmount**:
```typescript
useEffect(() => {
  const unsubscribe = manager.subscribe(config, callback);
  return () => unsubscribe(); // Always cleanup
}, [deps]);
```

**Cleanup on Component Destroy**:
```typescript
// Manager tracks all subscriptions
subscriptions: Map<string, Set<Callback>>

// When last callback unsubscribes, channel is removed
if (callbacks.size === 0) {
  this.removeChannel(channelName);
}
```

**Global Cleanup**:
- `visibilitychange` handlers removed on destroy
- `online/offline` handlers removed on destroy
- `beforeunload` handler persists state
- All channels explicitly closed on destroy

**Memory Leak Detection** (Development Mode):
```typescript
// Track total subscribers
const TOTAL_SUBSCRIBERS_KEY = 'realtime_subscribers_count';
console.log('Active subscribers:', realtimeManager.getSubscriberCount());

// Warning on high count
if (manager.getSubscriberCount() > 50) {
  console.warn('Potential subscription leak detected');
}
```

---

## Update Batching & Debouncing

### Problem
Rapid updates (e.g., 10 seats booked simultaneously) cause 10 separate renders.

### Solution

```typescript
// Batch updates within 100ms window
debounceUpdate(channelName, payload) {
  // Add to queue
  updateQueue.get(channelName).push({ timestamp, payload });

  // Reset timer
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    // Only notify with latest payload
    notifySubscribers(latestPayload);
  }, 100);
}
```

**Benefits**:
- Reduces renders from N to 1
- Prevents UI jank
- Handles thundering herd gracefully

---

## State Persistence

### Before Unload

```typescript
// Persist connection state
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('realtime_state', JSON.stringify({
    lastHeartbeat,
    reconnectAttempts,
    channels: Array.from(subscriptions.keys())
  }));
});
```

### On Reload

```javascript
// Restore state after page refresh
const persisted = sessionStorage.getItem('realtime_state');
if (persisted) {
  const { channels } = JSON.parse(persisted);
  // Resubscribe to all channels
  channels.forEach(name => resubscribeChannel(name));
}
```

---

## Usage Examples

### Basic Seat Subscription

```typescript
function SeatMap({ tripId }) {
  const { seats, locks, loading, connectionStatus } = useSeatUpdates({
    tripId,
    enabled: true,
  });

  if (loading) return <Skeleton />;

  return (
    <div>
      <ConnectionStatusIndicator showLatency />
      {seats.map(seat => (
        <SeatButton
          key={seat.id}
          seat={seat}
          isLocked={locks.has(seat.id)}
          status={seat.status}
        />
      ))}
    </div>
  );
}
```

### Generic Table Subscription

```typescript
function MessageList({ conversationId }) {
  const { data: messages, refresh } = useRealtimeSubscription<Message[]>(
    `messages-${conversationId}`,
    {
      table: 'messages',
      filter: `conversation_id=eq.${conversationId}`,
      enabled: true,
      initialData: [],
    }
  );

  return (
    <div>
      <button onClick={refresh}>Refresh</button>
      <ul>{messages.map(m => <li key={m.id}>{m.text}</li>)}</ul>
    </div>
  );
}
```

### Connection Status Display

```typescript
function Header() {
  return (
    <header className="flex justify-between">
      <Logo />
      <ConnectionStatusIndicator showDetails />
    </header>
  );
}
```

---

## Performance Considerations

### Debounce Window: 100ms
- Short enough for responsive UI
- Long enough to batch rapid updates

### Heartbeat Interval: 30 seconds
- Sensitive enough to detect disconnections
- Not too chatty for server

### Connection Timeout: 10 seconds
- Reasonable wait for slow networks
- Fails fast enough to trigger reconnect

### Max Reconnect Attempts: 10
- Allows ~18 minutes of retry attempts (1+2+4+8+16+32+60+60+60+60)
- Then gives up and shows manual reconnect option

---

## Monitoring & Observability

### Connection Metrics

```typescript
interface ConnectionMetrics {
  latency: number;           // Current latency (ms)
  reconnectAttempts: number;  // Current retry count
  lastHeartbeat: number;     // Timestamp of last heartbeat
  totalDisconnections: number; // Lifetime disconnect count
  avgLatency: number;        // Rolling average latency
  packetsReceived: number;   // Total realtime events received
  packetsDropped: number;    // Total missed events
}
```

### Health Status

| State | Color | Action |
|-------|-------|--------|
| Connected (latency < 100ms) | Green | Normal ops |
| Connected (latency 100-300ms) | Yellow | Warning |
| Connected (latency > 300ms) | Orange | Degraded experience |
| Reconnecting | Yellow (pulsing) | Auto-reconnecting |
| Disconnected | Gray | Waiting for network |
| Error | Red | Manual intervention needed |
| Suspended | Red | Max retries exceeded |

---

## Migration Guide

### Before (Old Implementation)

```typescript
// Manual subscription
const channel = supabase
  .channel(`seats-${tripId}`)
  .on('postgres_changes', { ... }, callback)
  .subscribe();

// No cleanup on unmount
// No reconnection handling
// No status tracking
```

### After (New Implementation)

```typescript
// Automatic subscription management
const { seats, locks, connectionStatus } = useSeatUpdates({ tripId });

// Automatic cleanup
// Automatic reconnection
// Full status tracking
```

---

## Testing

### Unit Tests

```typescript
describe('RealtimeManager', () => {
  it('should reconnect with exponential backoff', async () => {
    const manager = RealtimeManager.getInstance();
    manager.disconnect();
    await manager.connect();
    expect(manager.getConnectionStatus().state).toBe('connected');
  });

  it('should cleanup all subscriptions on destroy', () => {
    const manager = RealtimeManager.getInstance();
    manager.subscribe({ ... }, callback);
    manager.destroy();
    expect(manager.subscriptions.size).toBe(0);
  });
});
```

### Integration Tests

```bash
# Test network offline
chrome://inspect -> Network -> Offline

# Test latency
chrome://inspect -> Network -> Add throttling profile

# Test page visibility
chrome://inspect -> Rendering -> Emulate page visibility
```

---

## Troubleshooting

### Symptoms

| Issue | Cause | Solution |
|-------|-------|----------|
| Frequent reconnects | Network unstable | Check WiFi, increase heartbeat interval |
| Memory growing | Leaking subscriptions | Ensure cleanup on unmount |
| Stale data | Missed updates during disconnect | Manual refresh or stale recovery |
| High CPU | Too many updates | Increase debounce window |

### Debug Mode

```typescript
// Enable verbose logging
process.env.NEXT_PUBLIC_REALTIME_DEBUG = 'true';

// In development
if (process.env.NODE_ENV === 'development') {
  manager.client.realtime.setLogger((kind, msg, data) => {
    console.log(`[Realtime ${kind}]`, msg, data);
  });
}
```
