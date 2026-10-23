-- Admin control plane: authorization helpers, sensitive-data policies, and approval RPCs.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles up
    JOIN public.roles r ON r.id = up.role_id
    WHERE up.user_id = (SELECT auth.uid())
      AND up.is_active = true
      AND r.name IN ('super_admin', 'admin', 'staff')
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_read_payments ON public.payments;
DROP POLICY IF EXISTS admin_update_payments ON public.payments;
DROP POLICY IF EXISTS admin_read_passengers ON public.passengers;
CREATE POLICY admin_read_payments ON public.payments FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));
CREATE POLICY admin_update_payments ON public.payments FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_read_passengers ON public.passengers FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS admin_read_bookings ON public.bookings;
DROP POLICY IF EXISTS admin_update_bookings ON public.bookings;
DROP POLICY IF EXISTS admin_delete_bookings ON public.bookings;
CREATE POLICY admin_read_bookings ON public.bookings FOR SELECT TO authenticated USING ((SELECT public.is_platform_admin()));
CREATE POLICY admin_update_bookings ON public.bookings FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_delete_bookings ON public.bookings FOR DELETE TO authenticated USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS admin_update_trips ON public.trips;
DROP POLICY IF EXISTS admin_insert_trips ON public.trips;
DROP POLICY IF EXISTS admin_delete_trips ON public.trips;
CREATE POLICY admin_update_trips ON public.trips FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_insert_trips ON public.trips FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_delete_trips ON public.trips FOR DELETE TO authenticated USING ((SELECT public.is_platform_admin()));

DROP POLICY IF EXISTS admin_update_routes ON public.routes;
DROP POLICY IF EXISTS admin_insert_routes ON public.routes;
DROP POLICY IF EXISTS admin_update_operators ON public.operators;
DROP POLICY IF EXISTS admin_update_buses ON public.buses;
CREATE POLICY admin_update_routes ON public.routes FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_insert_routes ON public.routes FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_update_operators ON public.operators FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));
CREATE POLICY admin_update_buses ON public.buses FOR UPDATE TO authenticated USING ((SELECT public.is_platform_admin())) WITH CHECK ((SELECT public.is_platform_admin()));

CREATE OR REPLACE FUNCTION public.review_guest_payment(p_payment_id uuid, p_status text, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_booking_id uuid;
BEGIN
  IF NOT (SELECT public.is_platform_admin()) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'Invalid payment status'; END IF;
  SELECT booking_id INTO v_booking_id FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF v_booking_id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  UPDATE public.payments SET payment_status = p_status WHERE id = p_payment_id;
  UPDATE public.bookings SET payment_status = CASE WHEN p_status = 'approved' THEN 'paid' ELSE 'failed' END, status = CASE WHEN p_status = 'approved' THEN 'confirmed' ELSE 'rejected' END, notes = COALESCE(p_notes, notes) WHERE id = v_booking_id;
  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.review_guest_payment(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_guest_payment(uuid, text, text) TO authenticated;

GRANT SELECT ON public.payments, public.passengers TO authenticated;
GRANT UPDATE ON public.payments, public.bookings, public.trips, public.routes, public.operators, public.buses TO authenticated;
GRANT INSERT ON public.trips, public.routes TO authenticated;
GRANT DELETE ON public.bookings, public.trips TO authenticated;
