/**
 * Connection Status Indicator Component
 * Visual feedback for real-time connection state
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRealtimeConnection } from '@/hooks/use-realtime';
import { Wifi, WifiOff, Loader2, AlertTriangle, Clock } from 'lucide-react';

export interface ConnectionStatusIndicatorProps {
  showLatency?: boolean;
  showDetails?: boolean;
  className?: string;
}

type StatusLevel = 'good' | 'warning' | 'poor' | 'disconnected';

/**
 * Small indicator dot showing connection status
 */
export function ConnectionStatusIndicator({
  showLatency = false,
  showDetails = false,
  className = '',
}: ConnectionStatusIndicatorProps) {
  const connection = useRealtimeConnection();
  const [isHovered, setIsHovered] = useState(false);

  const statusInfo = useMemo(() => {
    const { state, latency, isReconnecting, reconnectingIn, lastError } = connection;

    if (state === 'connected') {
      const level: StatusLevel = latency < 100 ? 'good' : latency < 300 ? 'warning' : 'poor';
      return {
        level,
        color:
          level === 'good'
            ? 'bg-green-500'
            : level === 'warning'
            ? 'bg-yellow-500'
            : 'bg-orange-500',
        text: 'Connected',
        icon: Wifi,
        details: showLatency ? `${Math.round(latency)}ms` : undefined,
      };
    }

    if (state === 'reconnecting') {
      return {
        level: 'warning' as StatusLevel,
        color: 'bg-yellow-500',
        text: 'Reconnecting',
        icon: Loader2,
        details: reconnectingIn ? `${reconnectingIn}s` : undefined,
        animate: true,
      };
    }

    if (state === 'error' || state === 'suspended') {
      return {
        level: 'poor' as StatusLevel,
        color: 'bg-red-500',
        text: 'Connection Error',
        icon: AlertTriangle,
        details: lastError,
      };
    }

    return {
      level: 'disconnected' as StatusLevel,
      color: 'bg-gray-500',
      text: 'Disconnected',
      icon: WifiOff,
      details: undefined,
    };
  }, [connection, showLatency]);

  const Icon = statusInfo.icon;

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center gap-2">
        {/* Status dot */}
        <div className="relative">
          <div
            className={`w-2.5 h-2.5 rounded-full ${statusInfo.color} ${
              statusInfo.animate ? 'animate-pulse' : ''
            }`}
          />
          {statusInfo.level === 'good' && (
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-500 animate-ping opacity-50" />
          )}
        </div>

        {/* Icon (on hover or always if detailed) */}
        {(showDetails || isHovered) && (
          <Icon
            className={`h-4 w-4 ${
              connection.isConnected ? 'text-green-400' : 'text-yellow-400'
            } ${statusInfo.animate ? 'animate-spin' : ''}`}
          />
        )}

        {/* Text (on hover or always if detailed) */}
        {(showDetails || isHovered) && (
          <span className="text-xs text-slate-400">{statusInfo.text}</span>
        )}

        {/* Latency/Details */}
        {statusInfo.details && (showDetails || isHovered) && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {statusInfo.details}
          </span>
        )}
      </div>

      {/* Tooltip on hover */}
      {isHovered && !showDetails && (
        <div className="absolute top-full right-0 mt-1 z-50 px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-300 whitespace-nowrap">
          {statusInfo.text}
          {statusInfo.details && ` (${statusInfo.details})`}
        </div>
      )}
    </div>
  );
}

/**
 * Full connection status panel for debugging/admin
 */
export function ConnectionStatusPanel() {
  const connection = useRealtimeConnection();

  return (
    <div className="bg-slate-900/80 border border-slate-700/50 rounded-lg p-4 text-sm">
      <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-orange-500" />
        Connection Status
      </h3>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-slate-400">State</span>
          <span
            className={`font-medium ${
              connection.isConnected
                ? 'text-green-400'
                : connection.isReconnecting
                ? 'text-yellow-400'
                : 'text-red-400'
            }`}
          >
            {connection.state.toUpperCase()}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Latency</span>
          <span className="text-white">{Math.round(connection.latency)}ms</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Avg Latency</span>
          <span className="text-slate-300">{Math.round(connection.metrics.avgLatency)}ms</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Disconnections</span>
          <span className="text-slate-300">{connection.metrics.totalDisconnections}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Packets Received</span>
          <span className="text-green-400">{connection.metrics.packetsReceived}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-400">Packets Dropped</span>
          <span className="text-red-400">{connection.metrics.packetsDropped}</span>
        </div>

        {connection.reconnectingIn && (
          <div className="flex justify-between">
            <span className="text-slate-400">Reconnecting in</span>
            <span className="text-yellow-400">{connection.reconnectingIn}s</span>
          </div>
        )}

        {connection.lastError && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-xs">
            {connection.lastError}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Banner shown when offline or reconnecting
 */
export function ConnectionBanner() {
  const connection = useRealtimeConnection();
  const [dismissed, setDismissed] = useState(false);

  // Auto-dismiss when connected
  useEffect(() => {
    if (connection.isConnected) {
      setDismissed(false);
    }
  }, [connection.isConnected]);

  // Don't show when connected or dismissed
  if (connection.isConnected || dismissed) {
    return null;
  }

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm text-white ${
        connection.isReconnecting
          ? 'bg-yellow-600'
          : 'bg-red-600'
      }`}
    >
      <div className="flex items-center justify-center gap-2">
        {connection.isReconnecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Reconnecting...</span>
            {connection.reconnectingIn && (
              <span>({connection.reconnectingIn}s)</span>
            )}
          </>
        ) : (
          <>
            <WifiOff className="h-4 w-4" />
            <span>Live updates paused - {connection.lastError || 'Offline'}</span>
          </>
        )}
        <button
          onClick={() => setDismissed(true)}
          className="ml-4 px-2 py-0.5 rounded bg-white/20 hover:bg-white/30 text-xs"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

/**
 * Toast notification for connection changes
 */
export function ConnectionToast() {
  const connection = useRealtimeConnection();
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState('');
  const prevConnected = connection.isConnected;

  useEffect(() => {
    // Show toast when connection status changes
    if (connection.isConnected && !prevConnected) {
      setMessage('Live updates resumed');
      setShow(true);
      setTimeout(() => setShow(false), 3000);
    } else if (!connection.isConnected && prevConnected) {
      setMessage('Connection lost - retrying...');
      setShow(true);
      setTimeout(() => setShow(false), 5000);
    }
  }, [connection.isConnected, prevConnected]);

  if (!show) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
        connection.isConnected
          ? 'bg-green-600 text-white'
          : 'bg-yellow-600 text-white'
      } animate-slide-in`}
    >
      {connection.isConnected ? (
        <Wifi className="h-4 w-4" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      {message}
    </div>
  );
}

/**
 * Animated CSS for slide-in
 */
const styles = `
@keyframes slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
.animate-slide-in {
  animation: slide-in 0.3s ease-out;
}
`;

// Inject styles if in browser
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}
