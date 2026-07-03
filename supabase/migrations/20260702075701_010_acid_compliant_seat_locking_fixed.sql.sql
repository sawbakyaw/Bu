/*
# ACID-Compliant Seat Locking and Booking System - Fixed Version
Uses explicit status checks instead of now() in indexes
*/

-- ============================================
-- PART 1: SCHEMA CHANGES
-- ============================================

-- Add version columns for optimistic locking
ALTER TABLE seats ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS version integer DEFAULT 1;

-- Add is_active flag to seat_locks for efficient indexing
ALTER TABLE seat_locks ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create trigger to manage is_active based on expires_at
CREATE OR REPLACE FUNCTION update_lock_active_status()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_active := NEW.expires_at > now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_lock_active ON seat_locks;
CREATE TRIGGER trigger_update_lock_active
    BEFORE INSERT OR UPDATE ON seat_locks
    FOR EACH ROW EXECUTE FUNCTION update_lock_active_status();

-- Update existing locks
UPDATE seat_locks SET is_active = (expires_at > now()) WHERE is_active IS NULL OR is_active != (expires_at > now());

-- Unique constraint: One active lock per seat
CREATE UNIQUE INDEX IF NOT EXISTS idx_seat_locks_active_unique
ON seat_locks(seat_id) WHERE is_active = true;

-- Prevent double-booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_seats_booked_unique
ON seats(trip_id, seat_number) WHERE status = 'booked';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_seats_trip_number ON seats(trip_id, seat_number);
CREATE INDEX IF NOT EXISTS idx_seat_locks_active ON seat_locks(seat_id, is_active) WHERE is_active = true;

-- ============================================
-- PART 2: ADVISORY LOCK FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION acquire_trip_advisory_lock(trip_uuid uuid)
RETURNS boolean AS $$
BEGIN
    RETURN pg_try_advisory_xact_lock(
        ('x' || substr(trip_uuid::text, 1, 16))::bit(64)::bigint
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- PART 3: ATOMIC SEAT LOCK ACQUISITION
-- ============================================

CREATE OR REPLACE FUNCTION acquire_seat_lock(
    p_seat_id uuid,
    p_trip_id uuid,
    p_session_id text,
    p_lock_duration_minutes integer DEFAULT 10
)
RETURNS jsonb AS $$
DECLARE
    v_seat RECORD;
    v_existing_lock RECORD;
    v_expires_at timestamptz;
BEGIN
    v_expires_at := now() + (p_lock_duration_minutes || ' minutes')::interval;

    -- Acquire advisory lock for the trip
    IF NOT acquire_trip_advisory_lock(p_trip_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Another booking operation is in progress. Please retry.',
            'error_code', 'LOCK_CONTENTION'
        );
    END IF;

    -- Lock the seat row FOR UPDATE
    SELECT id, status, seat_number, version, price
    INTO v_seat
    FROM seats
    WHERE id = p_seat_id AND trip_id = p_trip_id
    FOR UPDATE NOWAIT;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Seat not found', 'error_code', 'SEAT_NOT_FOUND');
    END IF;

    IF v_seat.status = 'booked' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Seat is already booked', 'error_code', 'SEAT_BOOKED');
    END IF;

    -- Check for existing active lock
    SELECT id, session_id, expires_at
    INTO v_existing_lock
    FROM seat_locks
    WHERE seat_id = p_seat_id AND is_active = true;

    IF FOUND THEN
        IF v_existing_lock.session_id = p_session_id THEN
            -- Extend existing lock
            UPDATE seat_locks SET expires_at = v_expires_at WHERE id = v_existing_lock.id;
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Lock extended',
                'seat_id', p_seat_id,
                'seat_number', v_seat.seat_number,
                'expires_at', v_expires_at,
                'price', v_seat.price
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Seat locked by another user',
                'error_code', 'SEAT_LOCKED',
                'seat_number', v_seat.seat_number
            );
        END IF;
    END IF;

    -- Create new lock atomically
    BEGIN
        INSERT INTO seat_locks (seat_id, trip_id, session_id, expires_at, is_active)
        VALUES (p_seat_id, p_trip_id, p_session_id, v_expires_at, true);

        UPDATE seats SET status = 'locked', version = version + 1 WHERE id = p_seat_id;

        RETURN jsonb_build_object(
            'success', true,
            'message', 'Seat locked',
            'seat_id', p_seat_id,
            'seat_number', v_seat.seat_number,
            'expires_at', v_expires_at,
            'price', v_seat.price,
            'version', v_seat.version + 1
        );
    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Seat just locked by another user. Please retry.',
                'error_code', 'LOCK_RACE_DETECTED'
            );
        WHEN lock_not_available THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Seat is being modified. Please retry.',
                'error_code', 'ROW_LOCKED'
            );
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 4: ATOMIC SEAT LOCK RELEASE
-- ============================================

CREATE OR REPLACE FUNCTION release_seat_lock(
    p_seat_id uuid,
    p_trip_id uuid,
    p_session_id text
)
RETURNS jsonb AS $$
DECLARE
    v_seat RECORD;
BEGIN
    PERFORM acquire_trip_advisory_lock(p_trip_id);

    SELECT id, status, version INTO v_seat
    FROM seats
    WHERE id = p_seat_id AND trip_id = p_trip_id
    FOR UPDATE;

    DELETE FROM seat_locks
    WHERE seat_id = p_seat_id AND session_id = p_session_id AND is_active = true;

    IF FOUND THEN
        UPDATE seats SET status = 'available', version = version + 1
        WHERE id = p_seat_id AND status = 'locked';
        RETURN jsonb_build_object('success', true, 'message', 'Lock released', 'seat_id', p_seat_id);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Lock not found or not owned', 'error_code', 'LOCK_NOT_OWNED');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 5: ATOMIC BOOKING CONFIRMATION
-- ============================================

CREATE OR REPLACE FUNCTION confirm_booking(
    p_trip_id uuid,
    p_session_id text,
    p_passenger_name text,
    p_passenger_phone text,
    p_passenger_email text DEFAULT NULL,
    p_passenger_nrc text DEFAULT NULL,
    p_is_foreigner boolean DEFAULT false,
    p_notes text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    v_trip RECORD;
    v_seat_ids uuid[];
    v_seat_numbers text[];
    v_total_amount decimal(15,2) := 0;
    v_price_per_seat decimal(15,2);
    v_booking RECORD;
    v_seat_count integer;
BEGIN
    -- Acquire advisory lock
    IF NOT acquire_trip_advisory_lock(p_trip_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Another booking in progress', 'error_code', 'TRIP_LOCKED');
    END IF;

    -- Lock trip row
    SELECT t.*, t.version as trip_version INTO v_trip
    FROM trips t
    WHERE t.id = p_trip_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Trip not found', 'error_code', 'TRIP_NOT_FOUND');
    END IF;

    v_price_per_seat := COALESCE(
        CASE WHEN p_is_foreigner THEN v_trip.foreigner_price END,
        v_trip.base_price
    );

    -- Get locked seats for this session
    SELECT array_agg(s.id), array_agg(s.seat_number)
    INTO v_seat_ids, v_seat_numbers
    FROM seats s
    INNER JOIN seat_locks sl ON sl.seat_id = s.id
    WHERE sl.trip_id = p_trip_id
      AND sl.session_id = p_session_id
      AND sl.is_active = true
      AND s.status = 'locked';

    IF v_seat_ids IS NULL OR array_length(v_seat_ids, 1) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No locked seats found. Locks may have expired.',
            'error_code', 'NO_LOCKED_SEATS'
        );
    END IF;

    v_seat_count := array_length(v_seat_ids, 1);
    v_total_amount := v_seat_count * v_price_per_seat;

    BEGIN
        -- Create booking
        INSERT INTO bookings (
            trip_id, passenger_name, passenger_phone, passenger_email,
            passenger_nrc, seat_numbers, total_amount, payment_method,
            payment_status, is_foreigner, notes
        ) VALUES (
            p_trip_id, p_passenger_name, p_passenger_phone, p_passenger_email,
            p_passenger_nrc, v_seat_numbers, v_total_amount, 'pending',
            'pending', p_is_foreigner, p_notes
        ) RETURNING * INTO v_booking;

        -- Update seats to booked
        UPDATE seats
        SET status = 'booked', version = version + 1
        WHERE id = ANY(v_seat_ids);

        -- Remove locks
        DELETE FROM seat_locks
        WHERE trip_id = p_trip_id AND session_id = p_session_id;

        -- Update trip capacity
        UPDATE trips
        SET available_seats = available_seats - v_seat_count,
            version = version + 1
        WHERE id = p_trip_id;

        RETURN jsonb_build_object(
            'success', true,
            'booking_id', v_booking.id,
            'booking_reference', v_booking.booking_reference,
            'seat_numbers', v_seat_numbers,
            'total_amount', v_total_amount,
            'passenger_name', p_passenger_name
        );

    EXCEPTION
        WHEN unique_violation THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'One or more seats already booked by another user',
                'error_code', 'DOUBLE_BOOKING_DETECTED'
            );
        WHEN OTHERS THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', SQLERRM,
                'error_code', 'BOOKING_ERROR'
            );
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 6: CLEANUP FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_locks(p_trip_id uuid DEFAULT NULL)
RETURNS integer AS $$
DECLARE
    v_count integer;
BEGIN
    -- Mark expired locks as inactive
    IF p_trip_id IS NOT NULL THEN
        UPDATE seat_locks SET is_active = false
        WHERE trip_id = p_trip_id AND expires_at < now() AND is_active = true;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        -- Update seat statuses
        UPDATE seats SET status = 'available', version = version + 1
        WHERE trip_id = p_trip_id AND status = 'locked'
          AND id NOT IN (SELECT seat_id FROM seat_locks WHERE trip_id = p_trip_id AND is_active = true);

        -- Delete old inactive locks (older than 1 day)
        DELETE FROM seat_locks WHERE trip_id = p_trip_id AND is_active = false AND created_at < now() - interval '1 day';
    ELSE
        UPDATE seat_locks SET is_active = false
        WHERE expires_at < now() AND is_active = true;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE seats SET status = 'available', version = version + 1
        WHERE status = 'locked'
          AND id NOT IN (SELECT seat_id FROM seat_locks WHERE is_active = true);

        DELETE FROM seat_locks WHERE is_active = false AND created_at < now() - interval '1 day';
    END IF;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 7: SEAT STATUS QUERY
-- ============================================

CREATE OR REPLACE FUNCTION get_seat_status(p_trip_id uuid)
RETURNS TABLE (
    seat_id uuid,
    seat_number text,
    row_number integer,
    column_number integer,
    seat_type text,
    status text,
    price decimal(10,2),
    version integer,
    is_locked boolean,
    locked_by_session text,
    lock_expires_at timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.seat_number,
        s.row_number,
        s.column_number,
        s.seat_type,
        s.status,
        s.price,
        s.version,
        EXISTS (SELECT 1 FROM seat_locks sl WHERE sl.seat_id = s.id AND sl.is_active = true),
        COALESCE(sl.session_id, ''),
        COALESCE(sl.expires_at, NULL::timestamptz)
    FROM seats s
    LEFT JOIN seat_locks sl ON sl.seat_id = s.id AND sl.is_active = true
    WHERE s.trip_id = p_trip_id
    ORDER BY s.row_number, s.column_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PART 8: DOUBLE BOOKING PREVENTION TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION prevent_double_booking()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'booked' THEN
        IF EXISTS (
            SELECT 1 FROM seats
            WHERE trip_id = NEW.trip_id
              AND seat_number = NEW.seat_number
              AND status = 'booked'
              AND id != NEW.id
        ) THEN
            RAISE EXCEPTION 'Seat % is already booked for this trip', NEW.seat_number;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_double_booking ON seats;
CREATE TRIGGER trigger_prevent_double_booking
    BEFORE UPDATE ON seats
    FOR EACH ROW
    WHEN (OLD.status != 'booked' AND NEW.status = 'booked')
    EXECUTE FUNCTION prevent_double_booking();

-- ============================================
-- PART 9: GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION acquire_seat_lock TO anon, authenticated;
GRANT EXECUTE ON FUNCTION release_seat_lock TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_booking TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_locks TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_seat_status TO anon, authenticated;