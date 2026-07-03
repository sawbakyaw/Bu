/**
 * Server-side authentication and security utilities
 * These functions run only on the server (Node.js environment)
 */

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { checkRateLimit, getClientIdentifier } from './rate-limit';
import { ErrorCode, apiError, internalError, logSecurityEvent } from './api-errors';
import { NextResponse } from 'next/server';

// Admin Supabase client (server-side only)
function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Get user from session cookie
export async function getServerUser(request: NextRequest) {
  const cookieStore = cookies();
  const authCookie = cookieStore.get('sb-access-token');

  if (!authCookie?.value) {
    return null;
  }

  try {
    const supabase = createServerClient();
    const { data: { user }, error } = await supabase.auth.getUser(authCookie.value);

    if (error || !user) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

// Validate session and get user profile
export async function validateSessionAndProfile(request: NextRequest) {
  const user = await getServerUser(request);

  if (!user) {
    return { user: null, profile: null };
  }

  try {
    const supabase = createServerClient();
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*, roles(*)')
      .eq('user_id', user.id)
      .single();

    return { user, profile };
  } catch {
    return { user, profile: null };
  }
}

// Check if user has required role
export function hasRequiredRole(
  profile: any,
  requiredRoles: string[]
): boolean {
  const userRole = profile?.roles?.name;
  if (!userRole) return false;
  return requiredRoles.includes(userRole);
}

// Check if user has required permission
export function hasRequiredPermission(
  profile: any,
  requiredPermission: string
): boolean {
  const userRole = profile?.roles as any;
  if (!userRole?.permissions) return false;

  // Super admin has all permissions
  if (userRole.name === 'super_admin') return true;

  // Check direct permission
  if (userRole.permissions.includes(requiredPermission)) return true;

  // Check wildcard permission
  if (userRole.permissions.includes('*')) return true;

  // Check namespace permission (e.g., "bookings.*" for "bookings.create")
  const namespace = requiredPermission.split('.')[0];
  if (userRole.permissions.includes(`${namespace}.*`)) return true;

  return false;
}

// Auth middleware for API routes
export function createAuthMiddleware(
  requiredRoles: string[] | null = null,
  requiredPermission: string | null = null
) {
  return async function authMiddleware(request: NextRequest) {
    // Get client identifier for rate limiting
    const ip = request.ip ||
               request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    const sessionId = request.headers.get('x-session-id') || undefined;

    const clientIdentifier = getClientIdentifier(ip, userAgent, sessionId);

    // Check rate limit
    const rateLimitResult = checkRateLimit('api', clientIdentifier);
    if (!rateLimitResult.success) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip,
        userAgent,
        action: 'auth_middleware',
        status: 'blocked',
      });

      return apiError(
        ErrorCode.RATE_LIMITED,
        'Too many requests. Please slow down.',
        429,
        { retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000) }
      );
    }

    // Validate session
    const { user, profile } = await validateSessionAndProfile(request);

    if (!user) {
      logSecurityEvent('UNAUTHORIZED_ACCESS', {
        ip,
        userAgent,
        action: 'auth_middleware',
        status: 'failure',
      });

      return apiError(
        ErrorCode.UNAUTHORIZED,
        'Authentication required.',
        401
      );
    }

    // Check role if required
    if (requiredRoles && !hasRequiredRole(profile, requiredRoles)) {
      logSecurityEvent('FORBIDDEN_ACCESS', {
        ip,
        userAgent,
        userId: user.id,
        action: 'auth_middleware',
        status: 'failure',
      });

      return apiError(
        ErrorCode.FORBIDDEN,
        'You do not have permission to access this resource.',
        403
      );
    }

    // Check permission if required
    if (requiredPermission && !hasRequiredPermission(profile, requiredPermission)) {
      logSecurityEvent('FORBIDDEN_ACCESS', {
        ip,
        userAgent,
        userId: user.id,
        action: 'auth_middleware',
        resourceId: requiredPermission,
        status: 'failure',
      });

      return apiError(
        ErrorCode.FORBIDDEN,
        'You do not have permission to perform this action.',
        403
      );
    }

    // Return success with user info
    return { user, profile, clientIdentifier };
  };
}

// Public API middleware (no auth required, but rate limiting applies)
export function createPublicMiddleware(rateLimitType: 'search' | 'api' = 'api') {
  return function publicMiddleware(request: NextRequest) {
    const ip = request.ip ||
               request.headers.get('x-forwarded-for')?.split(',')[0] ||
               request.headers.get('x-real-ip') ||
               'unknown';
    const userAgent = request.headers.get('user-agent') || '';
    const sessionId = request.headers.get('x-session-id') || undefined;

    const clientIdentifier = getClientIdentifier(ip, userAgent, sessionId);

    // Check rate limit
    const rateLimitResult = checkRateLimit(rateLimitType, clientIdentifier);
    if (!rateLimitResult.success) {
      logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip,
        userAgent,
        action: 'public_api',
        status: 'blocked',
      });

      return {
        blocked: true,
        error: apiError(
          ErrorCode.RATE_LIMITED,
          'Too many requests. Please slow down.',
          429,
          { retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000) }
        ),
      };
    }

    return {
      blocked: false,
      clientIdentifier,
      rateLimitHeaders: {
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString(),
      },
    };
  };
}

// Input sanitization for server-side
export function sanitizeServerInput(input: string): string {
  if (!input) return '';

  return input
    .replace(/[<>]/g, '') // Remove potential XSS
    .replace(/["']/g, '') // Remove quotes
    .replace(/[;\\]/g, '') // Remove potential SQL injection chars
    .slice(0, 1000) // Limit length
    .trim();
}

// Validate UUID format
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Sanitize error for logging
export function sanitizeErrorForLog(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error.slice(0, 500);
  }
  return 'Unknown error';
}

// Log database query (for audit)
export function logDatabaseQuery(
  userId: string | undefined,
  operation: string,
  table: string,
  resourceId?: string
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: 'db_query',
    userId: userId || 'anonymous',
    operation,
    table,
    resourceId,
  };

  // In production, send to logging service
  if (process.env.NODE_ENV === 'production') {
    console.log('[DB]', JSON.stringify(logEntry));
  }
}
