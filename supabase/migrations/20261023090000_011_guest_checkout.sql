-- Additive guest checkout schema and atomic checkout RPC.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS schedule_id uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone_number text NOT NULL,
  nrc_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  transaction_ref text,
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_booking_reference ON public.bookings (booking_reference);
CREATE INDEX IF NOT EXISTS idx_bookings_passenger_phone ON public.bookings (passenger_phone);
CREATE INDEX IF NOT EXISTS idx_passengers_phone_number ON public.passengers (phone_number);
CREATE INDEX IF NOT EXISTS idx_passengers_booking_id ON public.passengers (booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.payments (booking_id);

ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS passengers_no_public_read ON public.passengers;
DROP POLICY IF EXISTS payments_no_public_read ON public.payments;
DROP POLICY IF EXISTS passengers_no_public_insert ON public.passengers;
DROP POLICY IF EXISTS payments_no_public_insert ON public.payments;
CREATE POLICY passengers_no_public_read ON public.passengers FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY payments_no_public_read ON public.payments FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY passengers_no_public_insert ON public.passengers FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY payments_no_public_insert ON public.payments FOR INSERT TO anon, authenticated WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.create_guest_booking(
  p_trip_id uuid,
  p_session_id text,
  p_seat_numbers text[],
  p_full_name text,
  p_phone_number text,
  p_nrc_number text DEFAULT NULL,
  p_payment_method text DEFAULT 'manual',
  p_transaction_ref text DEFAULT NULL,
  p_total_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  booking_id uuid;
  booking_ref text;
  seat_name text;
  seat_row public.seats%ROWTYPE;
  calculated_total numeric := 0;
  requested_total numeric;
BEGIN
  IF coalesce(trim(p_full_name), '') = '' OR coalesce(trim(p_phone_number), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Passenger name and phone are required');
  END IF;
  IF p_seat_numbers IS NULL OR cardinality(p_seat_numbers) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one seat is required');
  END IF;

  PERFORM public.cleanup_expired_locks(p_trip_id);

  FOREACH seat_name IN ARRAY p_seat_numbers LOOP
    SELECT * INTO seat_row
    FROM public.seats
    WHERE trip_id = p_trip_id AND seat_number = seat_name
    FOR UPDATE;
    IF NOT FOUND OR seat_row.status = 'booked' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Seat unavailable', 'error_code', 'SEAT_UNAVAILABLE');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.seat_locks
      WHERE seat_id = seat_row.id AND trip_id = p_trip_id AND session_id = p_session_id
        AND is_active = true AND expires_at > now()
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Seat lock expired', 'error_code', 'LOCK_EXPIRED');
    END IF;
    calculated_total := calculated_total + seat_row.price;
  END LOOP;

  requested_total := coalesce(p_total_amount, calculated_total);
  IF requested_total <> calculated_total THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid total amount', 'error_code', 'INVALID_TOTAL');
  END IF;

  INSERT INTO public.bookings (
    trip_id, passenger_name, passenger_phone, passenger_nrc, seat_numbers,
    total_amount, payment_method, payment_status, payment_reference, status
  ) VALUES (
    p_trip_id, trim(p_full_name), trim(p_phone_number), nullif(trim(p_nrc_number), ''),
    p_seat_numbers, calculated_total, p_payment_method, 'pending', p_transaction_ref, 'pending'
  ) RETURNING id, booking_reference INTO booking_id, booking_ref;

  INSERT INTO public.passengers (booking_id, full_name, phone_number, nrc_number)
  VALUES (booking_id, trim(p_full_name), trim(p_phone_number), nullif(trim(p_nrc_number), ''));

  INSERT INTO public.payments (booking_id, payment_method, transaction_ref, payment_status)
  VALUES (booking_id, p_payment_method, p_transaction_ref, 'pending');

  FOREACH seat_name IN ARRAY p_seat_numbers LOOP
    SELECT id INTO seat_row FROM public.seats WHERE trip_id = p_trip_id AND seat_number = seat_name FOR UPDATE;
    UPDATE public.seat_locks SET is_active = false
    WHERE seat_id = seat_row.id AND trip_id = p_trip_id AND session_id = p_session_id AND is_active = true;
    UPDATE public.seats SET status = 'booked' WHERE id = seat_row.id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'booking_id', booking_id, 'booking_reference', booking_ref, 'total_amount', calculated_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_booking(uuid, text, text[], text, text, text, text, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_guest_booking(uuid, text, text[], text, text, text, text, text, numeric) TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.bookings, public.seats, public.trips TO anon, authenticated;
