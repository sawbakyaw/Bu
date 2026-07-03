/**
 * Rate Limiting Middleware
 * Prevents DDoS and scraping attacks
 */

// Rate limit store (in production, use Redis)
interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations
export const RATE_LIMITS = {
  // Trip search - 30 per minute
  search: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many search requests. Please wait before searching again.',
  },
  // Seat locking - 20 per minute (prevent seat hoarding)
  seatLock: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    message: 'Too many seat selection attempts. Please slow down.',
  },
  // Booking creation - 5 per minute
  booking: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: 'Too many booking attempts. Please wait before trying again.',
  },
  // Payment - 10 per minute
  payment: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many payment attempts. Please wait.',
  },
  // Login attempts - 5 per 15 minutes (prevent brute force)
  login: {
    windowMs: 15 * 60 * 1000,
    maxRequests: 5,
    message: 'Too many login attempts. Please try again later.',
  },
  // Password reset - 3 per hour
  passwordReset: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    message: 'Too many password reset requests. Check your email or try again later.',
  },
  // API general - 100 per minute
  api: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'Rate limit exceeded. Please slow down.',
  },
  // Admin operations - 60 per minute
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Too many admin requests. Please slow down.',
  },
} as const;

export type RateLimitType = keyof typeof RATE_LIMITS;

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  blocked: boolean;
  message?: string;
}

/**
 * Check rate limit for an identifier
 */
export function checkRateLimit(
  type: RateLimitType,
  identifier: string
): RateLimitResult {
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const key = `${type}:${identifier}`;

  // Clean up expired entries periodically
  if (Math.random() < 0.01) {
    cleanupExpiredEntries();
  }

  let entry = rateLimitStore.get(key);

  // Create new entry if doesn't exist or expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false,
    };
    rateLimitStore.set(key, entry);
  }

  // Check if currently blocked
  if (entry.blocked && now < entry.resetTime) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
      message: config.message,
    };
  }

  // Increment counter
  entry.count++;

  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    entry.blocked = true;
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: entry.resetTime,
      blocked: true,
      message: config.message,
    };
  }

  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
    blocked: false,
  };
}

/**
 * Reset rate limit for an identifier (after successful action)
 */
export function resetRateLimit(type: RateLimitType, identifier: string): void {
  const key = `${type}:${identifier}`;
  rateLimitStore.delete(key);
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };
}

/**
 * Clean up expired entries (prevent memory leaks)
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const entries = Array.from(rateLimitStore.entries());
  for (const [key, entry] of entries) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get client identifier from request
 * Uses IP + User-Agent for server-side, session for client-side
 */
export function getClientIdentifier(
  ip: string | undefined,
  userAgent: string | undefined,
  sessionId?: string
): string {
  // For authenticated requests with session, use session
  if (sessionId) {
    return `session:${sessionId}`;
  }

  // For anonymous requests, use IP + User-Agent hash
  const uaHash = userAgent ? hashString(userAgent).slice(0, 8) : '';
  return `ip:${ip || 'unknown'}:${uaHash}`;
}

/**
 * Simple string hash (for fingerprinting)
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Create rate limit middleware for API routes
 */
export function createRateLimitMiddleware(type: RateLimitType) {
  return function rateLimitMiddleware(
    identifier: string
  ): { allowed: boolean; headers: Record<string, string>; error?: string } {
    const result = checkRateLimit(type, identifier);
    const headers = getRateLimitHeaders(result);

    return {
      allowed: result.success,
      headers: result.blocked ? headers : headers,
      error: result.success ? undefined : result.message,
    };
  };
}

/**
 * Advanced: Sliding window rate limiter (more accurate)
 */
export function slidingWindowRateLimit(
  type: RateLimitType,
  identifier: string
): RateLimitResult {
  const config = RATE_LIMITS[type];
  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `${type}:sliding:${identifier}`;

  // Get or create entry list
  let timestamps = rateLimitStore.get(key);

  if (!timestamps || typeof timestamps.count !== 'object') {
    timestamps = {
      count: 0,
      resetTime: now + config.windowMs,
      blocked: false,
    };
    rateLimitStore.set(key, timestamps);
  }

  // Count requests in window
  const requestsInWindow = (timestamps as any).timestamps || [];
  const validRequests = requestsInWindow.filter(
    (ts: number) => ts > windowStart
  );

  if (validRequests.length >= config.maxRequests) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      resetTime: validRequests[0] + config.windowMs,
      blocked: true,
      message: config.message,
    };
  }

  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - validRequests.length,
    resetTime: now + config.windowMs,
    blocked: false,
  };
}

// Export cleanup for external use
export { cleanupExpiredEntries };
