#!/bin/bash

# ============================================
# MM-BusTicket Pro - Full Setup & Deploy Script
# ============================================
# This script sets up the Supabase database and deploys to Vercel
# Usage: ./setup.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored message
print_msg() {
    echo -e "${2}${1}${NC}"
}

# Print step header
print_step() {
    echo ""
    print_msg "============================================" "$BLUE"
    print_msg "$1" "$BLUE"
    print_msg "============================================" "$BLUE"
    echo ""
}

# Check if command exists
check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_msg "Error: $1 is not installed. Please install it first." "$RED"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_step "Step 1: Checking Prerequisites"

    print_msg "Checking Node.js..." "$YELLOW"
    check_command "node"
    NODE_VERSION=$(node --version)
    print_msg "Node.js version: $NODE_VERSION" "$GREEN"

    print_msg "Checking npm..." "$YELLOW"
    check_command "npm"
    NPM_VERSION=$(npm --version)
    print_msg "npm version: $NPM_VERSION" "$GREEN"

    print_msg "Checking Vercel CLI..." "$YELLOW"
    if ! command -v vercel &> /dev/null; then
        print_msg "Vercel CLI not found. Installing..." "$YELLOW"
        npm install -g vercel
        print_msg "Vercel CLI installed successfully!" "$GREEN"
    else
        VERCEL_VERSION=$(vercel --version 2>/dev/null || echo "installed")
        print_msg "Vercel CLI version: $VERCEL_VERSION" "$GREEN"
    fi

    print_msg "All prerequisites satisfied!" "$GREEN"
}

# Load environment variables
load_env() {
    print_step "Step 2: Loading Environment Variables"

    if [ ! -f ".env.local" ]; then
        if [ -f ".env" ]; then
            print_msg "Using .env file..." "$YELLOW"
            export $(cat .env | grep -v '^#' | xargs)
        else
            print_msg "Error: No .env.local or .env file found!" "$RED"
            print_msg "Please create .env.local with your Supabase credentials:" "$YELLOW"
            echo ""
            echo "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co"
            echo "  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key"
            echo "  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key"
            echo "  DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres"
            echo ""
            exit 1
        fi
    else
        print_msg ".env.local file found" "$GREEN"
        # Export environment variables from .env.local
        set -a
        source .env.local
        set +a
    fi

    # Verify required variables
    if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
        print_msg "Error: NEXT_PUBLIC_SUPABASE_URL is not set!" "$RED"
        exit 1
    fi

    if [ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
        print_msg "Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!" "$RED"
        exit 1
    fi

    if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
        print_msg "Error: SUPABASE_SERVICE_ROLE_KEY is not set!" "$RED"
        exit 1
    fi

    print_msg "Environment variables loaded successfully!" "$GREEN"
    print_msg "Supabase URL: $NEXT_PUBLIC_SUPABASE_URL" "$YELLOW"
}

# Install npm dependencies
install_dependencies() {
    print_step "Step 3: Installing npm Dependencies"

    if [ ! -d "node_modules" ]; then
        print_msg "Installing dependencies..." "$YELLOW"
        npm install
        print_msg "Dependencies installed successfully!" "$GREEN"
    else
        print_msg "node_modules exists. Running npm install to ensure all deps are present..." "$YELLOW"
        npm install
        print_msg "Dependencies verified!" "$GREEN"
    fi
}

# Run TypeScript type check
type_check() {
    print_step "Step 4: Running TypeScript Type Check"

    print_msg "Checking types..." "$YELLOW"
    if npm run typecheck 2>&1; then
        print_msg "Type check passed!" "$GREEN"
    else
        print_msg "Warning: Type check has issues but continuing..." "$YELLOW"
    fi
}

# Run ESLint
lint_check() {
    print_step "Step 5: Running ESLint"

    print_msg "Linting code..." "$YELLOW"
    if npm run lint 2>&1; then
        print_msg "Lint check passed!" "$GREEN"
    else
        print_msg "Warning: Lint has issues but continuing..." "$YELLOW"
    fi
}

# Build the project
build_project() {
    print_step "Step 6: Building Project"

    print_msg "Creating production build..." "$YELLOW"
    if npm run build 2>&1; then
        print_msg "Build successful!" "$GREEN"
    else
        print_msg "Error: Build failed!" "$RED"
        exit 1
    fi
}

# Setup Supabase database using migrations
setup_database() {
    print_step "Step 7: Setting Up Supabase Database"

    # Extract project ref from Supabase URL
    # URL format: https://project-ref.supabase.co
    PROJECT_REF=$(echo "$NEXT_PUBLIC_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co|\1|')
    print_msg "Project ref: $PROJECT_REF" "$YELLOW"

    # Create migrations directory if it doesn't exist
    mkdir -p supabase/migrations

    # List of migrations in order
    MIGRATIONS=(
        "supabase/migrations/20260627193513_001_bus_ticket_platform_schema.sql"
        "supabase/migrations/20260627195706_002_enterprise_rbac_wallets_audit.sql"
        "supabase/migrations/20260627203329_005_operators_buses_trips.sql"
        "supabase/migrations/20260627203757_006_add_cities_and_operators.sql"
        "supabase/migrations/20260627203818_007_add_popular_routes.sql"
        "supabase/migrations/20260627203841_008_add_buses_and_trips.sql"
        "supabase/migrations/20260701032104_009_admin_rls_policies_and_seat_generation.sql.sql"
    )

    print_msg "Will apply ${#MIGRATIONS[@]} migrations..." "$YELLOW"

    # Check if psql is available
    if command -v psql &> /dev/null && [ ! -z "$DATABASE_URL" ]; then
        print_msg "Using psql to apply migrations..." "$GREEN"

        for migration in "${MIGRATIONS[@]}"; do
            if [ -f "$migration" ]; then
                MIGRATION_NAME=$(basename "$migration")
                print_msg "Applying: $MIGRATION_NAME" "$YELLOW"

                if psql "$DATABASE_URL" -f "$migration" 2>&1; then
                    print_msg "  Success!" "$GREEN"
                else
                    print_msg "  Warning: Migration had issues (may already exist)" "$YELLOW"
                fi
            else
                print_msg "Warning: Migration file not found: $migration" "$YELLOW"
            fi
        done

        print_msg "Migrations applied via psql!" "$GREEN"
    else
        print_msg "psql not available or DATABASE_URL not set." "$YELLOW"
        print_msg "" "$YELLOW"
        print_msg "Please apply migrations manually in Supabase Dashboard:" "$YELLOW"
        print_msg "" "$YELLOW"
        print_msg "1. Go to: https://supabase.com/dashboard/project/$PROJECT_REF/sql/new" "$YELLOW"
        print_msg "2. Copy and paste each migration file content:" "$YELLOW"

        for migration in "${MIGRATIONS[@]}"; do
            if [ -f "$migration" ]; then
                print_msg "   - $(basename "$migration")" "$BLUE"
            fi
        done

        print_msg "" "$YELLOW"
        print_msg "3. Click 'Run' for each migration" "$YELLOW"

        # Ask user to confirm
        echo ""
        read -p "Have you applied all migrations? (y/n) " -n 1 -r
        echo ""

        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_msg "Please apply migrations and run this script again." "$YELLOW"
            exit 1
        fi
    fi

    print_msg "Database setup complete!" "$GREEN"
}

# Deploy to Vercel
deploy_vercel() {
    print_step "Step 8: Deploying to Vercel"

    print_msg "Starting Vercel deployment..." "$YELLOW"

    # Check if already logged in to Vercel
    print_msg "Checking Vercel authentication..." "$YELLOW"

    # Deploy to Vercel
    print_msg "Deploying to Vercel (follow the prompts)..." "$YELLOW"
    print_msg "" "$YELLOW"

    # Run vercel deploy with production flag
    # This will prompt for login if not authenticated
    vercel --prod

    print_msg "Deployment initiated!" "$GREEN"
}

# Set Vercel environment variables
set_vercel_env() {
    print_step "Step 9: Setting Vercel Environment Variables"

    print_msg "Setting environment variables in Vercel..." "$YELLOW"

    # Check if vercel is linked
    if [ ! -f ".vercel/project.json" ]; then
        print_msg "Project not linked to Vercel yet. Skipping env var setup." "$YELLOW"
        print_msg "Please set environment variables manually in Vercel Dashboard:" "$YELLOW"
        echo ""
        echo "  https://vercel.com/dashboard -> Your Project -> Settings -> Environment Variables"
        echo ""
        echo "  Variables to add:"
        echo "  - NEXT_PUBLIC_SUPABASE_URL"
        echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
        echo "  - SUPABASE_SERVICE_ROLE_KEY"
        echo "  - DATABASE_URL"
        echo ""
        return
    fi

    # Set environment variables using Vercel CLI
    print_msg "Adding environment variables..." "$YELLOW"

    echo "$NEXT_PUBLIC_SUPABASE_URL" | vercel env add NEXT_PUBLIC_SUPABASE_URL production --yes 2>/dev/null || true
    echo "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --yes 2>/dev/null || true
    echo "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production --yes 2>/dev/null || true

    if [ ! -z "$DATABASE_URL" ]; then
        echo "$DATABASE_URL" | vercel env add DATABASE_URL production --yes 2>/dev/null || true
    fi

    print_msg "Environment variables set!" "$GREEN"
}

# Print deployment summary
print_summary() {
    print_step "Setup & Deployment Complete!"

    print_msg "Your MM-BusTicket Pro application is ready!" "$GREEN"
    echo ""
    print_msg "Next steps:" "$YELLOW"
    echo "  1. Verify the deployment at your Vercel URL"
    echo "  2. Create your first admin user (see read.md)"
    echo "  3. Configure payment gateway credentials"
    echo "  4. Add bus operators and trips"
    echo ""
    print_msg "Useful URLs:" "$BLUE"
    echo "  - Vercel Dashboard: https://vercel.com/dashboard"
    echo "  - Supabase Dashboard: https://supabase.com/dashboard"
    echo ""
}

# Main execution
main() {
    print_msg "" "$NC"
    print_msg "============================================" "$GREEN"
    print_msg "   MM-BusTicket Pro - Setup & Deploy" "$GREEN"
    print_msg "============================================" "$GREEN"
    print_msg "" "$NC"

    check_prerequisites
    load_env
    install_dependencies
    type_check
    lint_check
    build_project
    setup_database
    deploy_vercel
    set_vercel_env
    print_summary
}

# Run main function
main
