# Race Condition Fixes & ACID Compliance

## Executive Summary

This document details the critical race conditions and ACID violations identified in the original booking system implementation and the comprehensive fixes applied.

---

## Critical Issues Identified

### 1. Check-Then-Act Race Condition (CRITICAL)

**Original Code:**
```typescript
// Step 1: Check if seat is locked
const { data: existingLock } = await supabase
  .from('seat_locks')
  .select('*')
  .eq('seat_id', seat.id)
  .maybeSingle();

// Step 2: If not locked, create lock
if (!existingLock) {
  await supabase.from('seat_locks').insert({...});
}
```

**Problem:** Two users checking simultaneously at Step 1 both see "no lock" and proceed to Step 2, both acquiring locks on the same seat.

**Solution:** Atomic `acquire_seat_lock()` function using:
- PostgreSQL advisory locks to serialize requests
- `FOR UPDATE NOWAIT` row-level locking
- UNIQUE constraint on active locks to prevent duplicates
- Retry logic for lock contention

---

### 2. Lost Update Problem (HIGH)

**Original Code:**
```typescript
// Insert lock
await supabase.from('seat_locks').insert({...});

// Update seat status (separate operation)
await supabase.from('seats').update({status: 'locked'}).eq('id', seat.id);
```

**Problem:** Between these two operations, another transaction could modify the seat status, causing the lock to reference a seat in an inconsistent state.

**Solution:** Both operations are now within a single database transaction in `acquire_seat_lock()` with automatic rollback on failure.

---

### 3. Non-Atomic Booking Creation (CRITICAL)

**Original Code:**
```typescript
// 1. Create booking
const { data: booking } = await supabase.from('bookings').insert({...});

// 2. Update seats to booked
await supabase.from('seats').update({status: 'booked'}).in('id', seatIds);

// 3. Remove locks
await supabase.from('seat_locks').delete().eq('session_id', sessionId);

// 4. Update trip capacity
await supabase.from('trips').update({available_seats: ...}).eq('id', tripId);
```

**Problem:** 
- If operation 1 succeeds but 2 fails → orphaned booking with available seats
- If operations 1-2 succeed but 3 fails → locks remain, blocking seats
- If operations 1-3 succeed but 4 fails → capacity count is wrong

**Solution:** Single atomic `confirm_booking()` function executes all 4 operations within a database transaction with automatic rollback.

---

### 4. Missing Database Constraints (MEDIUM)

**Problem:** 
- No UNIQUE constraint on `(seat_id, active)` allowed multiple locks
- No constraint preventing double-booking of same seat
- `clean_expired_locks()` vs `cleanup_expired_locks()` function name inconsistency

**Solution:**
- Added `idx_seat_locks_active_unique` partial unique index
- Added `idx_seats_booked_unique` partial unique index
- Added `is_active` boolean column to seat_locks
- Added trigger to auto-manage `is_active` flag

---

### 5. Realtime Data Staleness (MEDIUM)

**Original Code:**
```typescript
// Fetch locks with expires_at > now()
.gt('expires_at', new Date().toISOString());
```

**Problem:** Client clock skew could cause incorrect lock visibility. Active locks could appear expired or vice versa.

**Solution:** Use `is_active` column managed by database triggers:
```sql
CREATE TRIGGER trigger_update_lock_active
  BEFORE INSERT OR UPDATE ON seat_locks
  FOR EACH ROW EXECUTE FUNCTION update_lock_active_status();
```

---

## Applied Solutions

### Schema Changes (Migration: 010_acid_compliant_seat_locking_fixed.sql)

| Change | Purpose |
|--------|---------|
| `seats.version` | Optimistic locking for detecting conflicts |
| `trips.version` | Track capacity modifications |
| `seat_locks.is_active` | Efficient active lock indexing |
| `idx_seat_locks_active_unique` | Prevent duplicate locks |
| `idx_seats_booked_unique` | Prevent double-booking |
| `trigger_prevent_double_booking` | Database-level enforcement |

### Atomic Functions Created

```sql
-- Advisory lock for serializing trip operations
acquire_trip_advisory_lock(trip_uuid) -> boolean

-- Atomic seat lock acquisition
acquire_seat_lock(seat_id, trip_id, session_id, duration) -> jsonb
  Returns: {success, error?, error_code?, seat_number, expires_at, price}

-- Atomic seat lock release
release_seat_lock(seat_id, trip_id, session_id) -> jsonb
  Returns: {success, error?, error_code?}

-- Atomic booking confirmation
confirm_booking(trip_id, session_id, passenger_info...) -> jsonb
  Returns: {success, booking_id?, booking_reference?, error?, error_code?}

-- Optimized cleanup
cleanup_expired_locks(trip_id?) -> integer
```

### Error Codes

| Code | Meaning | User Message |
|------|---------|-------------|
| `LOCK_CONTENTION` | Another booking in progress | "System busy. Please try again." |
| `SEAT_LOCKED` | Seat locked by another user | "Seat locked by another user." |
| `SEAT_BOOKED` | Seat already booked | "This seat has already been booked." |
| `LOCK_RACE_DETECTED` | Concurrent lock attempt | "Seat just locked by another user." |
| `ROW_LOCKED` | Row being modified | "Seat is being modified." |
| `NO_LOCKED_SEATS` | Locks expired | "Your seat locks have expired." |
| `DOUBLE_BOOKING_DETECTED` | Concurrent booking | "Seats booked by another user." |
| `TRIP_LOCKED` | Trip locked for booking | "Another booking in progress." |

---

## Performance Optimizations

### Indexes Added
```sql
CREATE INDEX idx_seat_locks_active ON seat_locks(seat_id, is_active) WHERE is_active = true;
CREATE INDEX idx_seats_trip_number ON seats(trip_id, seat_number);
```

### Advisory Lock Benefits
- Serialize operations without blocking reads
- Automatically released at transaction end
- No cleanup required

### Query Optimization
```sql
-- Before: Clock-dependent
.gt('expires_at', new Date().toISOString())

-- After: Index-efficient
.eq('is_active', true)
```

---

## Testing Recommendations

### Unit Tests
1. Test concurrent lock acquisition (2 users, 1 seat)
2. Test lock extension for same session
3. Test booking with missing locks
4. Test booking with expired locks
5. Test race condition on seat booking

### Integration Tests
```javascript
// Simulate concurrent lock attempts
await Promise.all([
  supabase.rpc('acquire_seat_lock', {...}),
  supabase.rpc('acquire_seat_lock', {...})
]);
// Exactly one should succeed
```

### Load Testing
- 100 concurrent users trying to book seats on same trip
- Verify no double-bookings
- Verify capacity count remains accurate

---

## Migration Checklist

- [x] Apply migration 010_acid_compliant_seat_locking_fixed.sql
- [x] Update trip/[id]/page.tsx to use `acquire_seat_lock()` and `release_seat_lock()`
- [x] Update passenger/[id]/page.tsx to use `confirm_booking()`
- [x] Update lock cleanup to use `cleanup_expired_locks()`
- [x] Update lock fetching to use `is_active` flag
- [ ] Test concurrent booking scenarios
- [ ] Update read.md with new API documentation

---

## References

- PostgreSQL Advisory Locks: https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS
- ACID Properties: https://www.ibm.com/docs/en/ibm-mq/9.0?topic=queues-acid-properties
- Race Conditions: https://docs.microsoft.com/en-us/azure/architecture/patterns/retry
