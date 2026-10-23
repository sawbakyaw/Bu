import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Keep the preview bootable when the optional Supabase integration has not been connected yet.
// Requests made without real credentials will still fail safely at the call site instead of
// crashing module evaluation and preventing the app from rendering.
const supabaseUrl = configuredSupabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = configuredSupabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      [tableName: string]: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships?: never[];
      };
      cities: {
        Row: {
          id: string;
          name: string;
          name_mm: string | null;
          is_popular: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          name_mm?: string | null;
          is_popular?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          name_mm?: string | null;
          is_popular?: boolean;
          created_at?: string;
        };
      };
      operators: {
        Row: {
          id: string;
          name: string;
          logo_url: string | null;
          description: string | null;
          contact_phone: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          logo_url?: string | null;
          description?: string | null;
          contact_phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo_url?: string | null;
          description?: string | null;
          contact_phone?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      buses: {
        Row: {
          id: string;
          operator_id: string;
          bus_number: string;
          bus_type: string;
          total_seats: number;
          amenities: string[];
          created_at: string;
        };
        Insert: {
          id?: string;
          operator_id: string;
          bus_number: string;
          bus_type?: string;
          total_seats?: number;
          amenities?: string[];
          created_at?: string;
        };
      };
      routes: {
        Row: {
          id: string;
          from_city_id: string;
          to_city_id: string;
          distance_km: number | null;
          estimated_duration_minutes: number | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_city_id: string;
          to_city_id: string;
          distance_km?: number | null;
          estimated_duration_minutes?: number | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      trips: {
        Row: {
          id: string;
          route_id: string;
          bus_id: string;
          operator_id: string;
          departure_time: string;
          arrival_time: string | null;
          base_price: number;
          foreigner_price: number | null;
          available_seats: number;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          route_id: string;
          bus_id: string;
          operator_id: string;
          departure_time: string;
          arrival_time?: string | null;
          base_price: number;
          foreigner_price?: number | null;
          available_seats?: number;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          route_id?: string;
          bus_id?: string;
          operator_id?: string;
          departure_time?: string;
          arrival_time?: string | null;
          base_price?: number;
          foreigner_price?: number | null;
          available_seats?: number;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      seats: {
        Row: {
          id: string;
          trip_id: string;
          seat_number: string;
          row_number: number;
          column_number: number;
          seat_type: string;
          status: string;
          price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          trip_id: string;
          seat_number: string;
          row_number: number;
          column_number: number;
          seat_type?: string;
          status?: string;
          price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          trip_id?: string;
          seat_number?: string;
          row_number?: number;
          column_number?: number;
          seat_type?: string;
          status?: string;
          price?: number;
          created_at?: string;
        };
      };
      seat_locks: {
        Row: {
          id: string;
          seat_id: string;
          trip_id: string;
          session_id: string;
          locked_at: string;
          expires_at: string;
          created_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          seat_id: string;
          trip_id: string;
          session_id: string;
          locked_at?: string;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          seat_id?: string;
          trip_id?: string;
          session_id?: string;
          locked_at?: string;
          expires_at?: string;
          created_at?: string;
        };
      };
      passengers: {
        Row: {
          id: string;
          booking_id: string;
          full_name: string;
          phone_number: string;
          nrc_number: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          full_name: string;
          phone_number: string;
          nrc_number?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          full_name?: string;
          phone_number?: string;
          nrc_number?: string | null;
          created_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          payment_method: string;
          transaction_ref: string | null;
          payment_status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          payment_method: string;
          transaction_ref?: string | null;
          payment_status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          payment_method?: string;
          transaction_ref?: string | null;
          payment_status?: string;
          created_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          booking_reference: string;
          schedule_id: string | null;
          trip_id: string;
          passenger_name: string;
          passenger_phone: string;
          passenger_email: string | null;
          passenger_nrc: string | null;
          seat_numbers: string[];
          total_amount: number;
          payment_method: string | null;
          payment_status: string;
          status: string;
          payment_reference: string | null;
          is_foreigner: boolean;
          notes: string | null;
          booked_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_reference?: string;
          trip_id: string;
          passenger_name: string;
          passenger_phone: string;
          passenger_email?: string | null;
          passenger_nrc?: string | null;
          seat_numbers: string[];
          total_amount: number;
          payment_method?: string | null;
          payment_status?: string;
          payment_reference?: string | null;
          is_foreigner?: boolean;
          notes?: string | null;
          booked_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_reference?: string;
          trip_id?: string;
          passenger_name?: string;
          passenger_phone?: string;
          passenger_email?: string | null;
          passenger_nrc?: string | null;
          seat_numbers?: string[];
          total_amount?: number;
          payment_method?: string | null;
          payment_status?: string;
          payment_reference?: string | null;
          is_foreigner?: boolean;
          notes?: string | null;
          booked_at?: string;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {
      generate_trip_seats: {
        Args: { trip_uuid: string; bus_total_seats: number; seat_price: number };
        Returns: void;
      };
      clean_expired_locks: {
        Args: {};
        Returns: void;
      };
      cleanup_expired_locks: {
        Args: { p_trip_id?: string | null };
        Returns: void;
      };
      acquire_seat_lock: {
        Args: {
          p_seat_id: string;
          p_trip_id: string;
          p_session_id: string;
          p_lock_duration_minutes?: number;
        };
        Returns: Json;
      };
      release_seat_lock: {
        Args: { p_seat_id: string; p_trip_id: string; p_session_id: string };
        Returns: Json;
      };
      confirm_booking: {
        Args: { p_booking_id: string; p_trip_id: string; p_session_id: string };
        Returns: Json;
      };
    };
    Enums: {};
  };
}
