/**
 * CORS Security Configuration
 */

export interface CorsConfig {
  origins: (string | RegExp)[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

/**
 * Development CORS (permissive for localhost)
 */
const devCorsConfig: CorsConfig = {
  origins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    /\.vercel\.app$/,
    /\.netlify\.app$/,
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'X-Session-ID',
    'X-Client-Info',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Production CORS (strict)
 */
const prodCorsConfig: CorsConfig = {
  origins: process.env.CORS_ORIGINS?.split(',') || [],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-Session-ID',
    'X-Client-Info',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  credentials: true,
  maxAge: 3600, // 1 hour
};

/**
 * Get CORS config based on environment
 */
export function getCorsConfig(): CorsConfig {
  const isDev = process.env.NODE_ENV !== 'production';
  return isDev ? devCorsConfig : prodCorsConfig;
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;

  const config = getCorsConfig();

  for (const allowed of config.origins) {
    if (allowed instanceof RegExp) {
      if (allowed.test(origin)) return true;
    } else if (allowed === origin) {
      return true;
    }
  }

  return false;
}

/**
 * Create CORS headers for response
 */
export function createCorsHeaders(origin: string | null): Record<string, string> {
  const config = getCorsConfig();
  const allowedOrigin: string = isOriginAllowed(origin) ? (origin || '*') : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': config.methods.join(', '),
    'Access-Control-Allow-Headers': config.allowedHeaders.join(', '),
    'Access-Control-Expose-Headers': config.exposedHeaders.join(', '),
    'Access-Control-Allow-Credentials': config.credentials.toString(),
    'Access-Control-Max-Age': config.maxAge.toString(),
  };
}

/**
 * Create preflight response (OPTIONS)
 */
export function createPreflightResponse(origin: string | null): Response {
  const headers = createCorsHeaders(origin);
  return new Response(null, { status: 204, headers: headers as HeadersInit });
}

/**
 * Add CORS headers to existing response
 */
export function addCorsHeaders(
  response: Response,
  origin: string | null
): Response {
  const corsHeaders = createCorsHeaders(origin);

  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

/**
 * Security headers
 */
export const securityHeaders = {
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // XSS protection
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',

  // Content security
  'Content-Security-Policy': `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https: blob:;
    font-src 'self' data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co;
    frame-ancestors 'none';
  `.replace(/\s+/g, ' ').trim(),

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // HSTS (HTTPS only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Feature policy
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

/**
 * Apply all security headers
 */
export function applySecurityHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }
  return response;
}
