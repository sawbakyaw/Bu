import { z } from 'zod';

// ============================================
// INPUT VALIDATION SCHEMAS
// ============================================

// UUID validation
export const uuidSchema = z.string().uuid();

// City name validation (Myanmar city names)
export const cityNameSchema = z.string()
  .min(1, 'City name is required')
  .max(100, 'City name too long')
  .regex(/^[a-zA-Z\s\-']+$/, 'Invalid city name format')
  .transform(val => val.trim());

// Date validation (booking must be within 30 days)
export const bookingDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format')
  .refine(val => {
    const date = new Date(val);
    const now = new Date();
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return date >= now && date <= maxDate;
  }, 'Booking date must be within the next 30 days');

// Seat count validation
export const seatCountSchema = z.number()
  .int('Seats must be a whole number')
  .min(1, 'At least 1 seat required')
  .max(10, 'Maximum 10 seats per booking');

// Passenger name validation
export const passengerNameSchema = z.string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name too long')
  .regex(/^[a-zA-Z\s\-'\.]+$/, 'Invalid characters in name')
  .transform(val => val.trim());

// Phone validation (Myanmar format: 09XXXXXXXXX)
export const phoneSchema = z.string()
  .regex(/^09[0-9]{7,9}$/, 'Invalid Myanmar phone number (format: 09XXXXXXXXX)')
  .transform(val => val.replace(/[\s-]/g, ''));

// Email validation
export const emailSchema = z.string()
  .email('Invalid email address')
  .max(255, 'Email too long')
  .transform(val => val.toLowerCase().trim())
  .optional()
  .or(z.literal(''));

// NRC validation (Myanmar format: 1/ABC(N)123456)
export const nrcSchema = z.string()
  .regex(/^[0-9]{1,2}\/[A-Za-z]{3,6}\([A-Za-z]\)[0-9]{6}$/, 'Invalid NRC format (e.g., 1/ABC(N)123456)')
  .transform(val => val.toUpperCase())
  .optional()
  .or(z.literal(''));

// Session ID validation
export const sessionIdSchema = z.string()
  .min(10, 'Invalid session')
  .max(100, 'Invalid session')
  .regex(/^session_[a-zA-Z0-9_]+$/, 'Invalid session format');

// Booking reference validation
export const bookingReferenceSchema = z.string()
  .regex(/^MMT-[A-Z0-9]{8}$/, 'Invalid booking reference format');

// Payment method validation
export const paymentMethodSchema = z.enum([
  'kbzpay', 'wave', 'wavepay', 'ayapay', 'cbpay', 'uabpay',
  'mpu', 'visa', 'master', 'stripe', 'paypal', 'bank_transfer'
]);

// Seat number validation (A1, B2, etc.)
export const seatNumberSchema = z.string()
  .regex(/^[A-Z][0-9]{1,2}$/, 'Invalid seat number format');

// Search parameters validation
export const searchParamsSchema = z.object({
  from: cityNameSchema,
  to: cityNameSchema,
  date: bookingDateSchema,
  seats: seatCountSchema,
  foreigner: z.boolean().default(false),
});

// Passenger form validation
export const passengerFormSchema = z.object({
  tripId: uuidSchema,
  sessionId: sessionIdSchema,
  passengerName: passengerNameSchema,
  passengerPhone: phoneSchema,
  passengerEmail: emailSchema,
  passengerNrc: nrcSchema,
  isForeigner: z.boolean().default(false),
  notes: z.string().max(500, 'Notes too long').optional().transform(val => val?.trim() || null),
});

// Booking confirmation validation
export const bookingConfirmSchema = z.object({
  tripId: uuidSchema,
  sessionId: sessionIdSchema,
  passengerName: passengerNameSchema,
  passengerPhone: phoneSchema,
  passengerEmail: emailSchema,
  passengerNrc: nrcSchema,
  isForeigner: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});

// API Request validation (for server-side)
export const apiRequestSchema = z.object({
  tripId: uuidSchema.optional(),
  bookingReference: bookingReferenceSchema.optional(),
  from: cityNameSchema.optional(),
  to: cityNameSchema.optional(),
  date: bookingDateSchema.optional(),
  seats: seatCountSchema.optional(),
  foreigner: z.boolean().optional(),
});

// Admin user update validation
export const adminUserUpdateSchema = z.object({
  userId: uuidSchema,
  name: passengerNameSchema.optional(),
  email: emailSchema,
  phone: phoneSchema.optional(),
  role: z.enum(['super_admin', 'admin', 'operator_admin', 'operator_staff', 'agent_admin', 'agent_staff', 'customer']).optional(),
  isActive: z.boolean().optional(),
});

// Operator validation
export const operatorSchema = z.object({
  name: z.string().min(1).max(200),
  logoUrl: z.string().url().optional().or(z.literal('')),
  description: z.string().max(1000).optional(),
  contactPhone: phoneSchema,
});

// ============================================
// SANITIZATION FUNCTIONS
// ============================================

// Sanitize string for display (prevent XSS)
export function sanitizeDisplayString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Sanitize phone number
export function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

// Sanitize booking reference
export function sanitizeBookingRef(ref: string): string {
  return ref.toUpperCase().replace(/[^A-Z0-9\-]/g, '');
}

// Sanitize NRC number
export function sanitizeNRC(nrc: string): string {
  return nrc.toUpperCase().replace(/[^A-Z0-9\/\(\)]/g, '');
}

// Sanitize email (already in schema transform)
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// Strip HTML tags
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

// Remove special characters for storage
export function sanitizeStorage(str: string): string {
  return str.replace(/[<>'"&]/g, '');
}

// ============================================
// ERROR HANDLING
// ============================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

// Validate data against schema
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);

    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    const errors: ValidationError[] = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return {
      success: false,
      errors,
    };
  } catch (error) {
    return {
      success: false,
      errors: [{ field: 'unknown', message: 'Validation failed' }],
    };
  }
}

// ============================================
// DATABASE QUERY SECURITY
// ============================================

// Escape special LIKE characters
export function escapeLikePattern(pattern: string): string {
  return pattern
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

// Validate and prepare search query
export function prepareSearchQuery(query: string): string {
  // Remove dangerous characters
  let sanitized = query.replace(/[;'"\\]/g, '');
  // Escape LIKE wildcards
  sanitized = escapeLikePattern(sanitized);
  // Return for LIKE query
  return `%${sanitized}%`;
}
