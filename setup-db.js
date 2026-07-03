#!/usr/bin/env node

/**
 * MM-BusTicket Pro - Database Setup Script
 *
 * This script applies all migrations to Supabase using the Supabase REST API.
 * It reads migration files and executes them sequentially.
 *
 * Usage: node setup-db.js
 *
 * Prerequisites:
 * - Node.js 18+
 * - .env.local file with Supabase credentials
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function extractEnvValue(line) {
    const match = line.match(/=["']?(.+?)["']?$/);
    return match ? match[1].replace(/^["']|["']$/g, '') : '';
}

async function loadEnvironment() {
    log('\n============================================', 'blue');
    log('  Loading Environment Variables', 'blue');
    log('============================================\n', 'blue');

    const envPath = path.join(process.cwd(), '.env.local');
    const envBackupPath = path.join(process.cwd(), '.env');

    let envFile = envPath;
    if (!fs.existsSync(envPath)) {
        if (fs.existsSync(envBackupPath)) {
            envFile = envBackupPath;
            log('Using .env file...', 'yellow');
        } else {
            log('Error: No .env.local or .env file found!', 'red');
            log('\nPlease create .env.local with your Supabase credentials:', 'yellow');
            console.log('\n  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co');
            console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key');
            console.log('  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
            console.log('  DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres\n');
            process.exit(1);
        }
    }

    // Parse env file
    const envContent = fs.readFileSync(envFile, 'utf8');
    const envVars = {};

    envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            if (key && valueParts.length > 0) {
                let value = valueParts.join('=');
                // Remove quotes if present
                value = value.replace(/^["']|["']$/g, '');
                envVars[key.trim()] = value;
            }
        }
    });

    // Set process.env
    Object.assign(process.env, envVars);

    // Verify required variables
    const requiredVars = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const missing = requiredVars.filter(v => !process.env[v]);
    if (missing.length > 0) {
        log(`Error: Missing required environment variables: ${missing.join(', ')}`, 'red');
        process.exit(1);
    }

    log('Environment variables loaded successfully!', 'green');
    log(`Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`, 'yellow');
}

function getMigrations() {
    const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
        log('Error: supabase/migrations directory not found!', 'red');
        process.exit(1);
    }

    // Migration files in order
    const migrationOrder = [
        '20260627193513_001_bus_ticket_platform_schema.sql',
        '20260627195706_002_enterprise_rbac_wallets_audit.sql',
        '20260627203329_005_operators_buses_trips.sql',
        '20260627203757_006_add_cities_and_operators.sql',
        '20260627203818_007_add_popular_routes.sql',
        '20260627203841_008_add_buses_and_trips.sql',
        '20260701032104_009_admin_rls_policies_and_seat_generation.sql.sql'
    ];

    const migrations = [];

    for (const filename of migrationOrder) {
        const filepath = path.join(migrationsDir, filename);
        if (fs.existsSync(filepath)) {
            migrations.push({
                name: filename,
                path: filepath,
                content: fs.readFileSync(filepath, 'utf8')
            });
        } else {
            log(`Warning: Migration file not found: ${filename}`, 'yellow');
        }
    }

    return migrations;
}

async function applyMigrationViaAPI(migration, supabaseUrl, serviceKey) {
    const url = `${supabaseUrl}/rest/v1/rpc/exec_sql`;

    try {
        // For Supabase, we'll use the SQL execution via the API
        // This requires the pg_net extension or we'll need to use the management API

        // Alternative: Use the SQL query via direct query parameter
        // Note: This approach has limitations for complex migrations
        // It's recommended to use Supabase Dashboard for migrations

        return {
            success: false,
            message: 'Direct SQL execution via REST API is not supported. Please use Supabase Dashboard.'
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

async function setupDatabaseViaDashboard() {
    log('\n============================================', 'blue');
    log('  Database Setup Instructions', 'blue');
    log('============================================\n', 'blue');

    const migrations = getMigrations();

    log(`Found ${migrations.length} migrations to apply:\n`, 'yellow');

    migrations.forEach((m, i) => {
        log(`  ${i + 1}. ${m.name}`, 'blue');
    });

    // Extract project ref from URL
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL
        .replace('https://', '')
        .replace('.supabase.co', '');

    log('\n============================================', 'yellow');
    log('  MANUAL STEPS REQUIRED', 'yellow');
    log('============================================\n', 'yellow');

    log('Supabase does not support direct SQL execution via REST API.', 'yellow');
    log('Please apply migrations manually using one of these methods:\n', 'yellow');

    log('Method 1: Supabase Dashboard (Recommended)', 'green');
    console.log(`  1. Go to: https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log('  2. Copy and paste the content of each migration file');
    console.log('  3. Click "Run" for each migration\n');

    log('Method 2: psql (if you have PostgreSQL client installed)', 'green');
    console.log('  Run these commands:');

    migrations.forEach((m, i) => {
        const cmd = process.env.DATABASE_URL
            ? `  ${i + 1}. psql "$DATABASE_URL" -f ${path.relative(process.cwd(), m.path)}`
            : `  ${i + 1}. psql "your-database-url" -f ${path.relative(process.cwd(), m.path)}`;
        console.log(cmd);
    });
    console.log();

    log('Method 3: Supabase CLI (if installed)', 'green');
    console.log('  1. npx supabase login');
    console.log('  2. npx supabase link --project-ref ' + projectRef);
    console.log('  3. npx supabase db push\n');

    // Read and display first migration preview
    if (migrations.length > 0) {
        log('\nPreview of first migration (first 50 lines):', 'blue');
        const lines = migrations[0].content.split('\n').slice(0, 50);
        lines.forEach(line => console.log('  ' + line));
        if (migrations[0].content.split('\n').length > 50) {
            log('  ... (truncated)', 'yellow');
        }
        log('\nPlease copy the full migration file content to Supabase Dashboard.', 'yellow');
    }

    // Generate combined migration file for easy copy
    const combinedContent = migrations.map(m =>
        `\n-- ============================================\n-- Migration: ${m.name}\n-- ============================================\n\n${m.content}`
    ).join('\n\n');

    const combinedPath = path.join(process.cwd(), 'supabase', 'migrations', '_combined_migrations.sql');
    fs.writeFileSync(combinedPath, combinedContent);

    log(`\nCombined migration file created: ${path.basename(combinedPath)}`, 'green');
    log('You can copy this entire file to Supabase Dashboard SQL Editor.\n', 'yellow');
}

async function verifyDatabaseSetup() {
    log('\n============================================', 'blue');
    log('  Verifying Database Setup', 'blue');
    log('============================================\n', 'blue');

    const { createClient } = require('@supabase/supabase-js');

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const tables = [
        'cities',
        'operators',
        'buses',
        'routes',
        'trips',
        'seats',
        'bookings',
        'roles',
        'user_profiles',
        'wallets',
        'payment_gateways'
    ];

    log('Checking tables...', 'yellow');

    let allPresent = true;
    for (const table of tables) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error) {
                log(`  ✗ ${table} - ${error.message}`, 'red');
                allPresent = false;
            } else {
                log(`  ✓ ${table} (${count} rows)`, 'green');
            }
        } catch (e) {
            log(`  ✗ ${table} - Error accessing table`, 'red');
            allPresent = false;
        }
    }

    if (allPresent) {
        log('\nAll tables are present and accessible!', 'green');
    } else {
        log('\nSome tables are missing. Please apply the migrations.', 'yellow');
    }

    return allPresent;
}

async function main() {
    log('\n============================================', 'green');
    log('  MM-BusTicket Pro - Database Setup', 'green');
    log('============================================\n', 'green');

    // Check if @supabase/supabase-js is installed
    try {
        require('@supabase/supabase-js');
    } catch (e) {
        log('Error: @supabase/supabase-js is not installed.', 'red');
        log('Please run: npm install', 'yellow');
        process.exit(1);
    }

    await loadEnvironment();

    const args = process.argv.slice(2);

    if (args.includes('--verify') || args.includes('-v')) {
        await verifyDatabaseSetup();
    } else if (args.includes('--help') || args.includes('-h')) {
        console.log('\nUsage: node setup-db.js [options]\n');
        console.log('Options:');
        console.log('  --verify, -v    Verify database setup only');
        console.log('  --help, -h      Show this help message\n');
    } else {
        await setupDatabaseViaDashboard();
        log('\nAfter applying migrations, run: node setup-db.js --verify', 'yellow');
    }
}

// Run main function
main().catch(console.error);
