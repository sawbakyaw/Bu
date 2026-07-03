# MM-BusTicket Pro - Complete Setup Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Database Setup](#database-setup)
5. [Frontend Setup](#frontend-setup)
6. [Authentication Setup](#authentication-setup)
7. [Seed Data](#seed-data)
8. [Development Workflow](#development-workflow)
9. [Production Deployment](#production-deployment)
10. [Troubleshooting](#troubleshooting)

---

## Project Overview

MM-BusTicket Pro is a comprehensive bus ticket aggregation platform for Myanmar with the following features:

### Core Features
- **Trip Search & Booking**: Search buses, select seats, and book tickets
- **Multi-Operator Support**: Multiple bus operators with their own fleets
- **Real-time Seat Locking**: 10-minute seat locks during booking
- **Dual Pricing**: Local and foreigner pricing
- **E-Ticket Fulfillment**: Automatic booking reference generation

### Enterprise Features
- **Role-Based Access Control (RBAC)**: Super Admin, Admin, Operator, Agent, Customer roles
- **Wallet System**: User, operator, and agent wallets
- **Commission System**: Configurable commission rules and payouts
- **Payment Gateways**: KBZ Pay, Wave Pay, AYA Pay, and more
- **Audit Logging**: Complete system activity tracking
- **CMS**: Content pages and banner management
- **Notifications**: Email and SMS templates

### Technology Stack
- **Frontend**: Next.js 13.5 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **State Management**: React Context, React Hook Form
- **Icons**: Lucide React

---

## Prerequisites

Before starting, ensure you have the following installed:

### Required Software
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher (comes with Node.js)
- **Git**: Latest version

### Required Accounts
- **Supabase Account**: Free tier at [supabase.com](https://supabase.com)
- **GitHub Account**: For code hosting (optional)

### Verify Prerequisites
```bash
# Check Node.js version
node --version

# Check npm version
npm --version

# Check Git version
git --version
```

---

## Environment Setup

### Step 1: Clone/Download Project
```bash
# If using Git
git clone <repository-url>
cd project

# Or navigate to your project directory
cd /path/to/project
```

### Step 2: Install Dependencies
```bash
# Install all npm dependencies
npm install
```

This will install all required packages including:
- Next.js framework
- Supabase client (@supabase/supabase-js)
- UI components (Radix UI, shadcn/ui)
- Form handling (react-hook-form, zod)
- Utilities (date-fns, lucide-react)

### Step 3: Configure Environment Variables

Create a `.env.local` file in the project root:

```bash
# Create .env.local file
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials:

```env
# ============================================
# SUPABASE CONFIGURATION
# ============================================

# Your Supabase project URL
# Found in: Supabase Dashboard > Settings > API > Project URL
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

# Anonymous Key (safe to expose in frontend)
# Found in: Supabase Dashboard > Settings > API > Project API keys > anon public
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Service Role Key (SECRET - never expose in frontend!)
# Found in: Supabase Dashboard > Settings > API > Project API keys > service_role
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ============================================
# DATABASE URL (for migrations)
# ============================================
# Format: postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres

# ============================================
# OPTIONAL: ANALYTICS
# ============================================
NEXT_PUBLIC_GA_TRACKING_ID=your-google-analytics-id
```

**Important Notes:**
- `NEXT_PUBLIC_` prefix makes variables accessible in the browser
- Never commit `.env.local` to Git (it's in `.gitignore`)
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret - it has full database access

---

## Database Setup

### Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in project details:
   - **Name**: mm-busticket-pro (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your users
4. Click "Create new project" and wait (~2 minutes)

### Step 2: Get Your Credentials

In Supabase Dashboard:

1. Go to **Settings** (gear icon) > **API**
2. Copy the following:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY`

3. Go to **Settings** > **Database**
4. Copy the **Connection string** (URI format)
   - Replace `[YOUR-PASSWORD]` with your database password
   - This goes in `DATABASE_URL`

### Step 3: Run Database Migrations

The database schema is split into multiple migration files. Apply them in order:

#### Migration Files (in order):
1. `001_bus_ticket_platform_schema.sql` - Core tables (cities, operators, buses, routes, trips, seats, bookings)
2. `002_enterprise_rbac_wallets_audit.sql` - Enterprise features (RBAC, wallets, payments)
3. `005_operators_buses_trips.sql` - Additional operators and buses
4. `006_add_cities_and_operators.sql` - Myanmar cities and more operators
5. `007_add_popular_routes.sql` - Popular bus routes
6. `008_add_buses_and_trips.sql` - Buses and scheduled trips
7. `009_admin_rls_policies_and_seat_generation.sql.sql` - Admin permissions and seat generation

#### Option A: Run via Supabase Dashboard (Recommended)

1. Go to **SQL Editor** in Supabase Dashboard
2. Create a new query
3. Copy and paste each migration file content (in order)
4. Click "Run" for each migration

#### Option B: Run via Supabase MCP Tools

The project is configured to use Supabase MCP tools for migrations:

```typescript
// Use the apply_migration tool for DDL operations
// Example: Apply migration via MCP
```

### Step 4: Verify Database Setup

After running all migrations, verify the tables:

```sql
-- In Supabase SQL Editor, run:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables (22 total):

**Core Tables:**
- `cities` - Myanmar cities
- `operators` - Bus operators
- `buses` - Individual buses
- `routes` - Routes between cities
- `trips` - Scheduled trips
- `seats` - Individual seats per trip
- `seat_locks` - Temporary seat locks
- `bookings` - Completed bookings

**Enterprise Tables:**
- `roles` - System roles
- `user_profiles` - Extended user data
- `wallets` - Financial wallets
- `wallet_transactions` - Transaction history
- `payment_gateways` - Payment configurations
- `gateway_transactions` - Payment records
- `commission_rules` - Commission configurations
- `commission_payouts` - Commission payments
- `refund_requests` - Refund management
- `audit_logs` - Activity logs
- `admin_actions` - Admin actions
- `notifications` - User notifications
- `notification_templates` - Notification templates
- `cms_pages` - Content pages
- `cms_banners` - Homepage banners
- `agents` - Agent companies
- `agent_users` - Agent staff
- `operator_users` - Operator staff
- `bus_stops` - Intermediate stops
- `trip_stops` - Trip stop sequences
- `two_factor_codes` - 2FA codes
- `user_sessions` - Device sessions

### Step 5: Verify Seed Data

Check that sample data was created:

```sql
-- Check cities
SELECT COUNT(*) FROM cities;  -- Should have 60+ cities

-- Check operators
SELECT COUNT(*) FROM operators;  -- Should have 15+ operators

-- Check routes
SELECT COUNT(*) FROM routes;  -- Should have 25+ routes

-- Check buses
SELECT COUNT(*) FROM buses;  -- Should have buses per operator

-- Check trips
SELECT COUNT(*) FROM trips;  -- Should have scheduled trips

-- Check payment gateways
SELECT name, display_name FROM payment_gateways ORDER BY display_order;

-- Check roles
SELECT name, display_name, level FROM roles ORDER BY level DESC;
```

---

## Frontend Setup

### Step 1: Project Structure

```
project/
├── app/                          # Next.js App Router pages
│   ├── admin/                    # Admin dashboard pages
│   │   ├── dashboard/           # Admin main dashboard
│   │   ├── users/               # User management
│   │   ├── operators/           # Operator management
│   │   ├── bookings/            # Booking management
│   │   ├── agents/              # Agent management
│   │   ├── wallets/             # Wallet management
│   │   ├── commissions/         # Commission management
│   │   ├── refunds/             # Refund management
│   │   ├── gateways/            # Payment gateway config
│   │   ├── notifications/       # Notification management
│   │   ├── cms/                 # Content management
│   │   ├── audit-logs/          # Activity logs
│   │   └── settings/            # System settings
│   ├── agent/                   # Agent portal
│   │   └── dashboard/
│   ├── operator/                # Operator portal
│   │   └── dashboard/
│   ├── search/                  # Trip search page
│   ├── trip/[id]/               # Trip detail & seat selection
│   ├── passenger/[id]/          # Passenger details form
│   ├── payment/[reference]/     # Payment page
│   ├── confirmation/[reference]/ # Booking confirmation
│   ├── login/                   # Login page
│   ├── signup/                  # Registration page
│   ├── forgot-password/         # Password recovery
│   ├── find-booking/            # Find booking by reference
│   ├── help/                    # Help/FAQ page
│   ├── terms/                   # Terms of service
│   ├── privacy/                 # Privacy policy
│   └── unauthorized/            # Access denied page
├── components/                   # React components
│   ├── ui/                      # shadcn/ui components
│   ├── header.tsx               # Site header
│   ├── footer.tsx               # Site footer
│   ├── search-form.tsx          # Trip search form
│   ├── admin-layout.tsx         # Admin layout wrapper
│   ├── agent-layout.tsx         # Agent layout wrapper
│   └── operator-layout.tsx      # Operator layout wrapper
├── hooks/                        # Custom React hooks
│   ├── use-auth.tsx             # Authentication hook
│   ├── use-language.tsx         # Language/locale hook
│   └── use-toast.ts             # Toast notifications hook
├── lib/                          # Utility libraries
│   ├── supabase.ts              # Supabase client & types
│   ├── types.ts                 # TypeScript types
│   ├── types-extended.ts        # Extended types
│   ├── utils.ts                 # Utility functions
│   └── translations.ts         # i18n translations
└── supabase/
    └── migrations/              # SQL migration files
```

### Step 2: Start Development Server

```bash
# Start Next.js development server
npm run dev
```

The server will start at [http://localhost:3000](http://localhost:3000)

### Step 3: Verify Frontend

1. Open browser to `http://localhost:3000`
2. You should see the homepage with:
   - Search form (cities, date, passengers)
   - Popular routes
   - Featured operators

3. Test the booking flow:
   - Search for a trip (e.g., Yangon → Mandalay)
   - Select a trip
   - Choose seats
   - Enter passenger details
   - Proceed to payment

---

## Authentication Setup

### Authentication Flow

The platform uses Supabase Auth with email/password authentication.

### Default Role System

| Role | Level | Access |
|------|-------|--------|
| super_admin | 100 | Full system access |
| admin | 90 | Admin dashboard |
| operator_admin | 70 | Operator management |
| operator_staff | 60 | Trip management |
| agent_admin | 50 | Agent management |
| agent_staff | 40 | Booking management |
| customer | 10 | Personal bookings |

### User Registration Flow

1. **Customer Registration**:
   - User signs up via `/signup`
   - Supabase Auth creates user
   - `user_profiles` row created (role: customer)
   - Wallet created for user

2. **Admin/Operator/Agent Users**:
   - Created by super_admin via admin dashboard
   - Assigned appropriate role
   - Linked to operator/agent organization

### Route Protection

Routes are protected based on user role:

```typescript
// Public routes (no auth required)
const publicRoutes = [
  '/', '/search', '/trip', '/passenger', '/payment',
  '/confirmation', '/help', '/find-booking',
  '/login', '/signup', '/forgot-password',
  '/terms', '/privacy', '/unauthorized'
];

// Role-protected routes:
// /admin/* → super_admin, admin
// /operator/* → super_admin, admin, operator_admin, operator_staff
// /agent/* → super_admin, admin, agent_admin, agent_staff
```

### Creating First Admin User

Since this is a fresh setup, create the first admin via SQL:

```sql
-- In Supabase SQL Editor

-- 1. First, sign up via the frontend (/signup) with your admin email
--    This creates the auth.users entry

-- 2. Get the user_id from auth.users
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 1;

-- 3. Update the user's role to super_admin
UPDATE user_profiles
SET role_id = (SELECT id FROM roles WHERE name = 'super_admin')
WHERE user_id = 'USER_ID_FROM_STEP_2';

-- 4. Verify the update
SELECT
  up.user_id,
  au.email,
  r.name as role_name,
  r.display_name
FROM user_profiles up
JOIN auth.users au ON up.user_id = au.id
JOIN roles r ON up.role_id = r.id
WHERE au.email = 'your-admin@email.com';
```

---

## Seed Data

### Already Seeded Data

The migrations automatically seed:

1. **Cities** (60+ cities):
   - Major cities: Yangon, Mandalay, Naypyitaw, Bagan
   - Regional cities: All state/region capitals
   - Tourist destinations: Inle, Ngapali, etc.

2. **Operators** (15+ operators):
   - Shwe Kayar Express
   - Akarit Express
   - Mya Sandar Express
   - Elite Express
   - And more...

3. **Routes** (25+ popular routes):
   - Yangon ↔ Mandalay
   - Yangon ↔ Bagan
   - Yangon ↔ Naypyitaw
   - Mandalay ↔ Bagan
   - And more...

4. **Payment Gateways** (11 gateways):
   - KBZ Pay, Wave Pay, AYA Pay
   - MPU, VISA, Mastercard
   - Bank Transfer

5. **Roles** (7 roles):
   - All default roles with permissions

6. **Notification Templates** (3 templates):
   - Booking confirmation (email + SMS)
   - Payment success (email)

### Generating Sample Trips

If trips weren't generated, create them manually:

```sql
-- Example: Create a trip for tomorrow
INSERT INTO trips (route_id, bus_id, operator_id, departure_time, arrival_time, base_price, foreigner_price, available_seats, status)
SELECT
  r.id as route_id,
  b.id as bus_id,
  o.id as operator_id,
  (CURRENT_DATE + INTERVAL '1 day')::timestamp + TIME '21:00:00' as departure_time,
  (CURRENT_DATE + INTERVAL '1 day')::timestamp + TIME '06:00:00' as arrival_time,
  25000 as base_price,  -- MMK
  35000 as foreigner_price,
  45 as available_seats,
  'scheduled' as status
FROM routes r
CROSS JOIN buses b
CROSS JOIN operators o
WHERE r.from_city_id = (SELECT id FROM cities WHERE name LIKE 'Yangon%' LIMIT 1)
  AND r.to_city_id = (SELECT id FROM cities WHERE name LIKE 'Mandalay%' LIMIT 1)
  AND b.operator_id = o.id
LIMIT 1;

-- Generate seats for the trip
SELECT generate_trip_seats(
  'TRIP_ID_FROM_ABOVE',
  45,  -- total seats
  25000  -- price per seat
);
```

### Adding More Sample Data

```sql
-- Add more cities
INSERT INTO cities (name, name_mm, is_popular)
VALUES ('New City', 'မြို့သစ်', false)
ON CONFLICT (name) DO NOTHING;

-- Add more operators
INSERT INTO operators (name, logo_url, description, is_active, contact_phone)
VALUES (
  'New Express',
  'https://res.cloudinary.com/your-cloud/image/upload/logo.png',
  'New bus operator description',
  true,
  '+95912345678'
)
ON CONFLICT DO NOTHING;

-- Add more buses
INSERT INTO buses (operator_id, bus_number, bus_type, total_seats, amenities)
SELECT
  id,  -- operator_id
  'BUS-001',
  'VIP Scania (2+1)',
  36,
  ARRAY['AC', 'WiFi', 'USB Charging', 'Blanket', 'Water']
FROM operators
WHERE name = 'Your Operator Name';
```

---

## Development Workflow

### Available npm Scripts

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server (after build)
npm start

# Run ESLint
npm run lint

# Run TypeScript type checking
npm run typecheck

# Full setup (prerequisites check + install + build + deploy)
npm run setup

# Database setup instructions
npm run setup:db

# Verify database tables are created
npm run setup:db:verify

# Deploy to Vercel (production)
npm run deploy

# Deploy to Vercel (preview)
npm run deploy:preview
```

### Quick Start Commands

```bash
# One-line setup (Linux/Mac)
curl -fsSL https://your-repo/setup.sh | bash

# Or run locally
./setup.sh

# Windows users
setup.cmd
```

### Development Best Practices

1. **Always run type checking before commits**:
   ```bash
   npm run typecheck
   ```

2. **Follow the component structure**:
   - Use `use client` directive for client components
   - Keep server components for data fetching
   - Use React hooks (useState, useEffect) appropriately

3. **Database changes**:
   - Create new migration files for schema changes
   - Never modify existing migrations after deployment
   - Always test migrations in development first

4. **Authentication**:
   - Use `useAuth()` hook for auth state
   - Check `hasRole()` for role-based access
   - Use `hasPermission()` for fine-grained permissions

### Common Development Tasks

#### Adding a New Page

```typescript
// app/new-page/page.tsx
'use client';

import { useAuth } from '@/hooks/use-auth';

export default function NewPage() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1>New Page</h1>
      {/* Page content */}
    </div>
  );
}
```

#### Adding a New Admin Page

```typescript
// app/admin/new-feature/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export default function AdminNewFeature() {
  const { hasRole } = useAuth();
  const [data, setData] = useState([]);

  useEffect(() => {
    if (!hasRole('super_admin', 'admin')) {
      // Redirect handled by AuthProvider
      return;
    }

    fetchData();
  }, []);

  async function fetchData() {
    const { data } = await supabase
      .from('your_table')
      .select('*');
    setData(data || []);
  }

  return (
    <div>
      <h1>New Feature Management</h1>
      {/* Admin content */}
    </div>
  );
}
```

#### Querying Data with Supabase

```typescript
// Example: Fetch trips with related data
const { data: trips, error } = await supabase
  .from('trips')
  .select(`
    id,
    departure_time,
    base_price,
    routes (
      from_city_id,
      to_city_id,
      cities_from:from_city_id (id, name, name_mm),
      cities_to:to_city_id (id, name, name_mm)
    ),
    operators (id, name, logo_url),
    buses (id, bus_number, bus_type, amenities)
  `)
  .eq('status', 'scheduled')
  .gte('departure_time', new Date().toISOString())
  .order('departure_time', { ascending: true });

// Check for errors
if (error) {
  console.error('Error fetching trips:', error);
  return;
}

// Use the data
console.log(trips);
```

---

## Production Deployment

### Step 1: Build the Project

```bash
# Run production build
npm run build

# Fix any build errors before proceeding
```

### Step 2: Environment Variables for Production

In your deployment platform (Vercel, Netlify, etc.), set:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@db.project-id.supabase.co:5432/postgres
```

### Step 3: Deployment Options

#### Option A: Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel --prod
   ```

3. Set environment variables in Vercel Dashboard

#### Option B: Netlify

1. The project includes `netlify.toml` configuration
2. Connect GitHub repository to Netlify
3. Set environment variables in Netlify Dashboard

#### Option C: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t mm-busticket .
docker run -p 3000:3000 mm-busticket
```

### Step 4: Supabase Production Settings

1. **Disable Email Confirmation** (if using custom auth):
   - Go to Authentication > Providers
   - Disable "Enable email confirmations"

2. **Configure CORS**:
   - Go to Settings > API
   - Add your production domain to allowed origins

3. **Set up Realtime** (for live seat updates):
   - Go to Database > Replication
   - Enable realtime for: `seats`, `seat_locks`, `bookings`

4. **Configure Storage** (if using file uploads):
   - Go to Storage
   - Create buckets for operator logos, etc.

### Step 5: Post-Deployment Verification

1. Test authentication flow
2. Test booking flow end-to-end
3. Verify payment gateway integration
4. Check admin dashboard access
5. Test on mobile devices

---

## Troubleshooting

### Common Issues

#### 1. "Invalid API key" Error

**Problem**: Supabase connection fails with API key error.

**Solution**:
- Double-check your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Ensure no extra spaces or line breaks in `.env.local`
- Restart development server after changing environment variables

#### 2. Empty Dashboard Pages

**Problem**: Admin dashboard shows no data.

**Solution**:
- Run migration `009_admin_rls_policies_and_seat_generation.sql.sql`
- This enables anon access for admin pages
- Check RLS policies in Supabase Dashboard > Authentication > Policies

#### 3. Authentication Not Working

**Problem**: Login/signup not working.

**Solution**:
- Check browser console for errors
- Verify Supabase URL and anon key
- Check if email confirmation is disabled in Supabase Dashboard
- Try clearing browser cache and cookies

#### 4. "relation does not exist" Error

**Problem**: SQL queries fail with table not found.

**Solution**:
- Run migrations in correct order (001, 002, 005, 006, 007, 008, 009)
- Check table existence in Supabase Dashboard > Table Editor
- Verify you're connected to correct database

#### 5. Seat Selection Not Working

**Problem**: Can't select seats on trip page.

**Solution**:
- Check if seats were generated for the trip
- Run: `SELECT generate_trip_seats('trip_id', 45, 25000)`
- Check `seats` table has rows for the trip

#### 6. Build Errors

**Problem**: `npm run build` fails.

**Solution**:
```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Try build again
npm run build
```

#### 7. Real-time Updates Not Working

**Problem**: Seat status not updating in real-time.

**Solution**:
- Enable realtime in Supabase Dashboard > Database > Replication
- Enable for `seats`, `seat_locks`, `bookings` tables
- Check browser console for WebSocket connection errors

### Useful SQL Queries

#### Check User's Role
```sql
SELECT
  au.email,
  r.name as role_name,
  r.display_name,
  r.permissions
FROM auth.users au
JOIN user_profiles up ON up.user_id = au.id
JOIN roles r ON r.id = up.role_id
WHERE au.email = 'user@example.com';
```

#### Check Trip Availability
```sql
SELECT
  t.id,
  t.departure_time,
  t.base_price,
  t.available_seats,
  (SELECT COUNT(*) FROM seats s WHERE s.trip_id = t.id AND s.status = 'booked') as booked_seats,
  o.name as operator_name
FROM trips t
JOIN operators o ON t.operator_id = o.id
WHERE t.departure_time > NOW()
ORDER BY t.departure_time;
```

#### Clean Expired Seat Locks
```sql
-- Run this periodically via cron job
SELECT clean_expired_locks();
```

#### Manual Booking Reference Lookup
```sql
SELECT
  b.booking_reference,
  b.passenger_name,
  b.passenger_phone,
  b.seat_numbers,
  b.total_amount,
  b.payment_status,
  t.departure_time
FROM bookings b
JOIN trips t ON b.trip_id = t.id
WHERE b.booking_reference = 'MMT-XXXXXXXX';
```

### Getting Help

1. **Check Documentation**:
   - Supabase Docs: [supabase.com/docs](https://supabase.com/docs)
   - Next.js Docs: [nextjs.org/docs](https://nextjs.org/docs)
   - shadcn/ui: [ui.shadcn.com](https://ui.shadcn.com)

2. **Community Resources**:
   - Supabase Discord: [discord.supabase.com](https://discord.supabase.com)
   - Next.js GitHub Discussions: [github.com/vercel/next.js/discussions](https://github.com/vercel/next.js/discussions)

3. **Debug Mode**:
   - Enable debug logging in browser console
   - Check Supabase logs in Dashboard > Logs
   - Use React DevTools for component inspection

---

## Quick Reference

### Default Credentials

After setup, you'll need to create the first admin user manually (see Authentication Setup section).

### Important URLs

| Page | URL | Auth Required |
|------|-----|---------------|
| Homepage | `/` | No |
| Search | `/search` | No |
| Trip Details | `/trip/[id]` | No |
| Passenger Info | `/passenger/[id]` | No |
| Payment | `/payment/[reference]` | No |
| Confirmation | `/confirmation/[reference]` | No |
| Login | `/login` | No |
| Signup | `/signup` | No |
| Admin Dashboard | `/admin/dashboard` | Yes (super_admin/admin) |
| Operator Dashboard | `/operator/dashboard` | Yes (operator_admin/staff) |
| Agent Dashboard | `/agent/dashboard` | Yes (agent_admin/staff) |

### Key Database Tables Quick Reference

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `cities` | Destinations | id, name, name_mm, is_popular |
| `operators` | Bus companies | id, name, logo_url, is_active |
| `buses` | Vehicles | id, operator_id, bus_type, total_seats |
| `routes` | City connections | id, from_city_id, to_city_id, distance_km |
| `trips` | Scheduled journeys | id, route_id, departure_time, base_price |
| `seats` | Individual seats | id, trip_id, seat_number, status, price |
| `bookings` | Reservations | id, booking_reference, passenger_name, total_amount |
| `user_profiles` | Extended user data | id, user_id, role_id, phone_verified |
| `wallets` | Financial accounts | id, user_id, balance, wallet_type |

---

## Next Steps

1. **Configure Payment Gateways**: Add API credentials for KBZ Pay, Wave Pay, etc.
2. **Customize UI**: Update colors, logos, and branding
3. **Add Operators**: Invite bus operators to the platform
4. **Set Up Agents**: Create agent accounts for offline booking
5. **Configure Email/SMS**: Set up notification delivery (Twilio, SendGrid)
6. **Add Analytics**: Enable Google Analytics or similar
7. **Performance**: Enable caching, optimize images
8. **Security**: Review RLS policies, enable 2FA for admins

---

**Last Updated**: 2026-07-02
**Version**: 1.0.0
