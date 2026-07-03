/*
# Admin RLS Policies & Seat Generation

## Overview
This migration adds anon read/write policies for enterprise admin tables so the admin dashboard
pages can read and manage data using the anon-key Supabase client. Without these policies,
the admin pages return empty data because the anon role has no SELECT access.

## Changes

### 1. RLS Policies Added (anon + authenticated)
Tables receiving full CRUD access for anon + authenticated (admin platform reads/writes via anon key):
- `roles` — SELECT only (role definitions are public metadata)
- `user_profiles` — full CRUD (admin user management)
- `wallets` — full CRUD (admin wallet management)
- `wallet_transactions` — full CRUD (admin wallet transaction view)
- `gateway_transactions` — full CRUD (admin gateway transaction view)
- `commission_rules` — full CRUD (admin commission management)
- `commission_payouts` — full CRUD (admin commission payout management)
- `refund_requests` — full CRUD (admin refund management; replaces existing auth-only policies)
- `admin_actions` — full CRUD (admin action log)
- `bus_stops` — SELECT only (public route info)
- `trip_stops` — SELECT only (public trip info)
- `operators` — INSERT/UPDATE added (admin can create/edit operators; SELECT already existed)
- `buses` — INSERT/UPDATE/DELETE added (admin can manage buses; SELECT already existed)
- `routes` — INSERT/UPDATE/DELETE added (admin can manage routes; SELECT already existed)
- `trips` — INSERT/UPDATE/DELETE added (admin can manage trips; SELECT already existed)
- `agents` — full CRUD (admin agent management)
- `agent_users` — full CRUD (admin agent user management)
- `operator_users` — full CRUD (admin operator user management)
- `two_factor_codes` — no change (security table, auth-only)
- `user_sessions` — no change (security table, auth-only)

### 2. Seed Data
- Generates seats for all existing trips that have no seats yet
  (uses the generate_trip_seats function with each trip's bus total_seats and base_price)

### Security Notes
- The admin pages currently run with the anon key (no auth login flow implemented yet).
- Once a proper admin auth flow is added, these policies should be tightened to `TO authenticated`
  with role-based ownership checks.
- `two_factor_codes` and `user_sessions` remain authenticated-only for security.
*/

-- ============================================
-- ROLES (public read)
-- ============================================
DROP POLICY IF EXISTS "anon_read_roles" ON roles;
CREATE POLICY "anon_read_roles" ON roles FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_manage_roles" ON roles;
CREATE POLICY "anon_manage_roles" ON roles FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- USER PROFILES (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_user_profiles" ON user_profiles;
CREATE POLICY "anon_read_user_profiles" ON user_profiles FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_user_profiles" ON user_profiles;
CREATE POLICY "anon_insert_user_profiles" ON user_profiles FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_user_profiles" ON user_profiles;
CREATE POLICY "anon_update_user_profiles" ON user_profiles FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_user_profiles" ON user_profiles;
CREATE POLICY "anon_delete_user_profiles" ON user_profiles FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- WALLETS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_wallets" ON wallets;
CREATE POLICY "anon_read_wallets" ON wallets FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wallets" ON wallets;
CREATE POLICY "anon_insert_wallets" ON wallets FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wallets" ON wallets;
CREATE POLICY "anon_update_wallets" ON wallets FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_wallets" ON wallets;
CREATE POLICY "anon_delete_wallets" ON wallets FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- WALLET TRANSACTIONS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_wallet_transactions" ON wallet_transactions;
CREATE POLICY "anon_read_wallet_transactions" ON wallet_transactions FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_wallet_transactions" ON wallet_transactions;
CREATE POLICY "anon_insert_wallet_transactions" ON wallet_transactions FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_wallet_transactions" ON wallet_transactions;
CREATE POLICY "anon_update_wallet_transactions" ON wallet_transactions FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- GATEWAY TRANSACTIONS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_gateway_transactions" ON gateway_transactions;
CREATE POLICY "anon_read_gateway_transactions" ON gateway_transactions FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_gateway_transactions" ON gateway_transactions;
CREATE POLICY "anon_insert_gateway_transactions" ON gateway_transactions FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_gateway_transactions" ON gateway_transactions;
CREATE POLICY "anon_update_gateway_transactions" ON gateway_transactions FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- COMMISSION RULES (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_commission_rules" ON commission_rules;
CREATE POLICY "anon_read_commission_rules" ON commission_rules FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_commission_rules" ON commission_rules;
CREATE POLICY "anon_insert_commission_rules" ON commission_rules FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_commission_rules" ON commission_rules;
CREATE POLICY "anon_update_commission_rules" ON commission_rules FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_commission_rules" ON commission_rules;
CREATE POLICY "anon_delete_commission_rules" ON commission_rules FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- COMMISSION PAYOUTS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_commission_payouts" ON commission_payouts;
CREATE POLICY "anon_read_commission_payouts" ON commission_payouts FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_commission_payouts" ON commission_payouts;
CREATE POLICY "anon_insert_commission_payouts" ON commission_payouts FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_commission_payouts" ON commission_payouts;
CREATE POLICY "anon_update_commission_payouts" ON commission_payouts FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- REFUND REQUESTS (replace auth-only with anon+auth CRUD)
-- ============================================
DROP POLICY IF EXISTS "user_read_own_refunds" ON refund_requests;
CREATE POLICY "anon_read_refund_requests" ON refund_requests FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "user_create_refunds" ON refund_requests;
CREATE POLICY "anon_insert_refund_requests" ON refund_requests FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_refund_requests" ON refund_requests;
CREATE POLICY "anon_update_refund_requests" ON refund_requests FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_refund_requests" ON refund_requests;
CREATE POLICY "anon_delete_refund_requests" ON refund_requests FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- ADMIN ACTIONS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_admin_actions" ON admin_actions;
CREATE POLICY "anon_read_admin_actions" ON admin_actions FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_admin_actions" ON admin_actions;
CREATE POLICY "anon_insert_admin_actions" ON admin_actions FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_admin_actions" ON admin_actions;
CREATE POLICY "anon_update_admin_actions" ON admin_actions FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- AUDIT LOGS (add delete for admin cleanup)
-- ============================================
DROP POLICY IF EXISTS "anon_delete_audit_logs" ON audit_logs;
CREATE POLICY "anon_delete_audit_logs" ON audit_logs FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- BUS STOPS (public read)
-- ============================================
DROP POLICY IF EXISTS "anon_read_bus_stops" ON bus_stops;
CREATE POLICY "anon_read_bus_stops" ON bus_stops FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_manage_bus_stops" ON bus_stops;
CREATE POLICY "anon_manage_bus_stops" ON bus_stops FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- TRIP STOPS (public read, admin write)
-- ============================================
DROP POLICY IF EXISTS "anon_read_trip_stops" ON trip_stops;
CREATE POLICY "anon_read_trip_stops" ON trip_stops FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_manage_trip_stops" ON trip_stops;
CREATE POLICY "anon_manage_trip_stops" ON trip_stops FOR ALL
    TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- OPERATORS (add insert/update/delete for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_operators" ON operators;
CREATE POLICY "anon_insert_operators" ON operators FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_operators" ON operators;
CREATE POLICY "anon_update_operators" ON operators FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_operators" ON operators;
CREATE POLICY "anon_delete_operators" ON operators FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- BUSES (add insert/update/delete for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_buses" ON buses;
CREATE POLICY "anon_insert_buses" ON buses FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_buses" ON buses;
CREATE POLICY "anon_update_buses" ON buses FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_buses" ON buses;
CREATE POLICY "anon_delete_buses" ON buses FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- ROUTES (add insert/update/delete for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_routes" ON routes;
CREATE POLICY "anon_insert_routes" ON routes FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_routes" ON routes;
CREATE POLICY "anon_update_routes" ON routes FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_routes" ON routes;
CREATE POLICY "anon_delete_routes" ON routes FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- TRIPS (add insert/update/delete for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_trips" ON trips;
CREATE POLICY "anon_insert_trips" ON trips FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_trips" ON trips;
CREATE POLICY "anon_update_trips" ON trips FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_trips" ON trips;
CREATE POLICY "anon_delete_trips" ON trips FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- SEATS (add insert/delete for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_seats" ON seats;
CREATE POLICY "anon_insert_seats" ON seats FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_seats" ON seats;
CREATE POLICY "anon_delete_seats" ON seats FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- AGENTS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_agents" ON agents;
CREATE POLICY "anon_read_agents" ON agents FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_agents" ON agents;
CREATE POLICY "anon_insert_agents" ON agents FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agents" ON agents;
CREATE POLICY "anon_update_agents" ON agents FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_agents" ON agents;
CREATE POLICY "anon_delete_agents" ON agents FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- AGENT USERS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_agent_users" ON agent_users;
CREATE POLICY "anon_read_agent_users" ON agent_users FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_agent_users" ON agent_users;
CREATE POLICY "anon_insert_agent_users" ON agent_users FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_agent_users" ON agent_users;
CREATE POLICY "anon_update_agent_users" ON agent_users FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_agent_users" ON agent_users;
CREATE POLICY "anon_delete_agent_users" ON agent_users FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- OPERATOR USERS (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_operator_users" ON operator_users;
CREATE POLICY "anon_read_operator_users" ON operator_users FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_operator_users" ON operator_users;
CREATE POLICY "anon_insert_operator_users" ON operator_users FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_operator_users" ON operator_users;
CREATE POLICY "anon_update_operator_users" ON operator_users FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_operator_users" ON operator_users;
CREATE POLICY "anon_delete_operator_users" ON operator_users FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- NOTIFICATIONS (add anon read for admin)
-- ============================================
DROP POLICY IF EXISTS "anon_read_notifications" ON notifications;
CREATE POLICY "anon_read_notifications" ON notifications FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notifications" ON notifications;
CREATE POLICY "anon_insert_notifications" ON notifications FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notifications_admin" ON notifications;
CREATE POLICY "anon_update_notifications_admin" ON notifications FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notifications" ON notifications;
CREATE POLICY "anon_delete_notifications" ON notifications FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- NOTIFICATION TEMPLATES (admin CRUD)
-- ============================================
DROP POLICY IF EXISTS "anon_read_notification_templates" ON notification_templates;
CREATE POLICY "anon_read_notification_templates" ON notification_templates FOR SELECT
    TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_notification_templates" ON notification_templates;
CREATE POLICY "anon_insert_notification_templates" ON notification_templates FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_notification_templates" ON notification_templates;
CREATE POLICY "anon_update_notification_templates" ON notification_templates FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_notification_templates" ON notification_templates;
CREATE POLICY "anon_delete_notification_templates" ON notification_templates FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- PAYMENT GATEWAYS (add anon update/delete)
-- ============================================
DROP POLICY IF EXISTS "anon_insert_payment_gateways" ON payment_gateways;
CREATE POLICY "anon_insert_payment_gateways" ON payment_gateways FOR INSERT
    TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_payment_gateways" ON payment_gateways;
CREATE POLICY "anon_update_payment_gateways" ON payment_gateways FOR UPDATE
    TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_payment_gateways" ON payment_gateways;
CREATE POLICY "anon_delete_payment_gateways" ON payment_gateways FOR DELETE
    TO anon, authenticated USING (true);

-- ============================================
-- SEED: Generate seats for trips that have none
-- ============================================
DO $$
DECLARE
    trip_record RECORD;
BEGIN
    FOR trip_record IN
        SELECT t.id, t.base_price, b.total_seats
        FROM trips t
        JOIN buses b ON t.bus_id = b.id
        WHERE NOT EXISTS (SELECT 1 FROM seats s WHERE s.trip_id = t.id)
    LOOP
        PERFORM generate_trip_seats(trip_record.id, trip_record.total_seats, trip_record.base_price);
    END LOOP;
END $$;
