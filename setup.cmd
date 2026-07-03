@echo off
REM ============================================
REM MM-BusTicket Pro - Full Setup & Deploy Script (Windows)
REM ============================================
REM This script sets up the Supabase database and deploys to Vercel
REM Usage: setup.cmd

setlocal enabledelayedexpansion

REM Colors (Windows 10+)
set "GREEN=[92m"
set "YELLOW=[93m"
set "RED=[91m"
set "BLUE=[94m"
set "NC=[0m"

echo.
echo ============================================
echo    MM-BusTicket Pro - Setup ^& Deploy
echo ============================================
echo.

REM Step 1: Check prerequisites
echo.
echo [Step 1] Checking Prerequisites...
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo %RED%Error: Node.js is not installed. Please install from https://nodejs.org%NC%
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo %GREEN%Node.js version: %NODE_VERSION%%NC%

where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo %RED%Error: npm is not installed.%NC%
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo %GREEN%npm version: %NPM_VERSION%%NC%

where vercel >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo %YELLOW%Vercel CLI not found. Installing...%NC%
    npm install -g vercel
    if %ERRORLEVEL% neq 0 (
        echo %RED%Error: Failed to install Vercel CLI%NC%
        exit /b 1
    )
    echo %GREEN%Vercel CLI installed!%NC%
) else (
    echo %GREEN%Vercel CLI is installed%NC%
)

echo %GREEN%All prerequisites satisfied!%NC%

REM Step 2: Check environment variables
echo.
echo [Step 2] Checking Environment Variables...
echo.

if not exist ".env.local" (
    if exist ".env" (
        echo %YELLOW%Using .env file...%NC%
        REM Load .env manually in Windows
        for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
            set "%%a=%%b"
        )
    ) else (
        echo %RED%Error: No .env.local or .env file found!%NC%
        echo.
        echo Please create .env.local with your Supabase credentials:
        echo.
        echo   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
        echo   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
        echo   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
        echo   DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
        echo.
        exit /b 1
    )
) else (
    echo %GREEN%.env.local file found%NC%
    REM Load .env.local
    for /f "usebackq tokens=1,* delims==" %%a in (".env.local") do (
        set "%%a=%%b"
    )
)

REM Verify required variables
if not defined NEXT_PUBLIC_SUPABASE_URL (
    echo %RED%Error: NEXT_PUBLIC_SUPABASE_URL is not set!%NC%
    exit /b 1
)
if not defined NEXT_PUBLIC_SUPABASE_ANON_KEY (
    echo %RED%Error: NEXT_PUBLIC_SUPABASE_ANON_KEY is not set!%NC%
    exit /b 1
)
if not defined SUPABASE_SERVICE_ROLE_KEY (
    echo %RED%Error: SUPABASE_SERVICE_ROLE_KEY is not set!%NC%
    exit /b 1
)

echo %GREEN%Environment variables loaded successfully!%NC%
echo %YELLOW%Supabase URL: %NEXT_PUBLIC_SUPABASE_URL%%NC%

REM Step 3: Install dependencies
echo.
echo [Step 3] Installing Dependencies...
echo.

if not exist "node_modules" (
    echo %YELLOW%Installing dependencies...%NC%
    npm install
    if %ERRORLEVEL% neq 0 (
        echo %RED%Error: npm install failed%NC%
        exit /b 1
    )
) else (
    echo %YELLOW%Verifying dependencies...%NC%
    npm install
)

echo %GREEN%Dependencies installed!%NC%

REM Step 4: Type check
echo.
echo [Step 4] Running TypeScript Type Check...
echo.

npm run typecheck
if %ERRORLEVEL% equ 0 (
    echo %GREEN%Type check passed!%NC%
) else (
    echo %YELLOW%Warning: Type check has issues but continuing...%NC%
)

REM Step 5: Lint
echo.
echo [Step 5] Running ESLint...
echo.

npm run lint
if %ERRORLEVEL% equ 0 (
    echo %GREEN%Lint check passed!%NC%
) else (
    echo %YELLOW%Warning: Lint has issues but continuing...%NC%
)

REM Step 6: Build
echo.
echo [Step 6] Building Project...
echo.

npm run build
if %ERRORLEVEL% neq 0 (
    echo %RED%Error: Build failed!%NC%
    exit /b 1
)
echo %GREEN%Build successful!%NC%

REM Step 7: Database setup
echo.
echo [Step 7] Database Setup Instructions
echo.

echo %YELLOW%Migrations need to be applied manually via Supabase Dashboard:%NC%
echo.
echo Migrations to apply (in order):
echo   1. 001_bus_ticket_platform_schema.sql
echo   2. 002_enterprise_rbac_wallets_audit.sql
echo   3. 005_operators_buses_trips.sql
echo   4. 006_add_cities_and_operators.sql
echo   5. 007_add_popular_routes.sql
echo   6. 008_add_buses_and_trips.sql
echo   7. 009_admin_rls_policies_and_seat_generation.sql.sql
echo.
echo Steps:
echo   1. Go to your Supabase Dashboard SQL Editor
echo   2. Copy and paste each migration file content
echo   3. Click 'Run' for each migration
echo.

set /p CONTINUE="Have you applied all migrations? (y/n): "
if /i not "%CONTINUE%"=="y" (
    echo %YELLOW%Please apply migrations and run this script again.%NC%
    exit /b 0
)

echo %GREEN%Database setup confirmed!%NC%

REM Step 8: Deploy
echo.
echo [Step 8] Deploying to Vercel...
echo.

echo %YELLOW%Starting Vercel deployment (follow the prompts)...%NC%
echo.

vercel --prod

if %ERRORLEVEL% neq 0 (
    echo %RED%Error: Deployment failed!%NC%
    exit /b 1
)

echo %GREEN%Deployment complete!%NC%

REM Step 9: Environment variables reminder
echo.
echo [Step 9] Setting Environment Variables
echo.

echo %YELLOW%Set these environment variables in Vercel Dashboard:%NC%
echo.
echo   Settings ^> Environment Variables:
echo   - NEXT_PUBLIC_SUPABASE_URL=%NEXT_PUBLIC_SUPABASE_URL%
echo   - NEXT_PUBLIC_SUPABASE_ANON_KEY
echo   - SUPABASE_SERVICE_ROLE_KEY
echo   - DATABASE_URL
echo.

REM Summary
echo.
echo ============================================
echo   Setup ^& Deployment Complete!
echo ============================================
echo.
echo %GREEN%Your MM-BusTicket Pro application is ready!%NC%
echo.
echo Next steps:
echo   1. Verify the deployment at your Vercel URL
echo   2. Create your first admin user (see read.md)
echo   3. Configure payment gateway credentials
echo   4. Add bus operators and trips
echo.
echo Useful URLs:
echo   - Vercel Dashboard: https://vercel.com/dashboard
echo   - Supabase Dashboard: https://supabase.com/dashboard
echo.

endlocal
