/**
 * Secure API Error Handling
 * Prevents information leakage and provides consistent error responses
 */

import { NextResponse } from 'next/server';

// Error codes for client handling
export enum ErrorCode {
  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',

  // Rate limiting
  RATE_LIMITED = 'RATE_LIMITED',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',

  // Business logic errors
  SEAT_UNAVAILABLE = 'SEAT_UNAVAILABLE',
  BOOKING_FAILED = 'BOOKING_FAILED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  TRIP_CANCELLED = 'TRIP_CANCELLED',
  LOCK_EXPIRED = 'LOCK_EXPIRED',
  DOUBLE_BOOKING = 'DOUBLE_BOOKING',

  // System errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
}

interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string>;
    requestId?: string;
    retryAfter?: number;
  };
}

interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// Generate unique request ID
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Sanitize error message for production
function sanitizeErrorMessage(error: unknown, isProd: boolean): string {
  if (!isProd) {
    // Development: show full error
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'An unknown error occurred';
  }

  // Production: hide implementation details
  return 'An error occurred. Please try again.';
}

/**
 * Create standardized success response
 */
export function apiSuccess<T>(data: T, statusCode = 200): NextResponse {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
    },
  };

  return NextResponse.json(response, { status: statusCode });
}

/**
 * Create standardized error response
 */
export function apiError(
  code: ErrorCode,
  message: string,
  statusCode: number = 400,
  options?: {
    details?: Record<string, string>;
    retryAfter?: number;
  }
): NextResponse {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details: options?.details,
      requestId: generateRequestId(),
      retryAfter: options?.retryAfter,
    },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.retryAfter) {
    headers['Retry-After'] = options.retryAfter.toString();
  }

  return NextResponse.json(response, { status: statusCode, headers });
}

/**
 * Validation error (400)
 */
export function validationError(
  details: Record<string, string>
): NextResponse {
  return apiError(
    ErrorCode.VALIDATION_ERROR,
    'Validation failed. Please check your input.',
    400,
    { details }
  );
}

/**
 * Field validation error
 */
export function fieldError(field: string, message: string): NextResponse {
  return validationError({ [field]: message });
}

/**
 * Authentication required (401)
 */
export function unauthorized(): NextResponse {
  return apiError(
    ErrorCode.UNAUTHORIZED,
    'Authentication required. Please log in.',
    401
  );
}

/**
 * Permission denied (403)
 */
export function forbidden(): NextResponse {
  return apiError(
    ErrorCode.FORBIDDEN,
    'You do not have permission to perform this action.',
    403
  );
}

/**
 * Rate limited (429)
 */
export function rateLimited(retryAfter: number = 60): NextResponse {
  return apiError(
    ErrorCode.RATE_LIMITED,
    'Too many requests. Please slow down.',
    429,
    { retryAfter }
  );
}

/**
 * Resource not found (404)
 */
export function notFound(resource: string): NextResponse {
  return apiError(
    ErrorCode.NOT_FOUND,
    `${resource} not found.`,
    404
  );
}

/**
 * Conflict error (409)
 */
export function conflict(message: string): NextResponse {
  return apiError(
    ErrorCode.CONFLICT,
    message,
    409
  );
}

/**
 * Internal server error (500)
 * Sanitizes error details in production
 */
export function internalError(error?: unknown): NextResponse {
  const isProd = process.env.NODE_ENV === 'production';
  const message = sanitizeErrorMessage(error, isProd);

  console.error('[API Error]', error);

  return apiError(
    ErrorCode.INTERNAL_ERROR,
    isProd ? 'An internal error occurred. Please try again.' : message,
    500
  );
}

/**
 * Service unavailable (503)
 */
export function serviceUnavailable(service: string): NextResponse {
  return apiError(
    ErrorCode.SERVICE_UNAVAILABLE,
    `${service} is temporarily unavailable. Please try again later.`,
    503
  );
}

/**
 * Wrap API handler with error handling
 */
export function withErrorHandler<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse> {
  return handler().catch((error) => {
    console.error('[API Error]', error);
    return internalError(error);
  });
}

/**
 * Database error handler
 */
export function handleDatabaseError(error: any): NextResponse {
  // Check for specific database errors
  if (error?.code === '23505') {
    return apiError(
      ErrorCode.ALREADY_EXISTS,
      'This record already exists.',
      409
    );
  }

  if (error?.code === '23503') {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      'Referenced record does not exist.',
      400
    );
  }

  if (error?.code === 'P0001') {
    return apiError(
      ErrorCode.DATABASE_ERROR,
      'Database operation failed.',
      500
    );
  }

  return internalError(error);
}

/**
 * Supabase error handler
 */
export function handleSupabaseError(error: {
  message: string;
  code?: string;
  details?: string;
}): NextResponse {
  // Map Supabase errors to API errors
  if (error.message?.includes('JWT')) {
    return apiError(
      ErrorCode.INVALID_TOKEN,
      'Invalid or expired token.',
      401
    );
  }

  if (error.message?.includes('permission denied')) {
    return forbidden();
  }

  if (error.message?.includes('not found')) {
    return notFound('Resource');
  }

  return internalError(error);
}

/**
 * Audit logging for security events
 */
export function logSecurityEvent(
  event: string,
  details: {
    ip?: string;
    userId?: string;
    userAgent?: string;
    resourceId?: string;
    action?: string;
    status: 'success' | 'failure' | 'blocked';
  }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };

  // In production, send to logging service (e.g., Logflare, Datadog)
  console.log('[SECURITY]', JSON.stringify(logEntry));
}

/**
 * Validate origin for CSRF protection
 */
export function validateOrigin(
  origin: string | null,
  allowedOrigins: string[]
): boolean {
  if (!origin) return false;
  return allowedOrigins.includes(origin) || allowedOrigins.includes('*');
}
