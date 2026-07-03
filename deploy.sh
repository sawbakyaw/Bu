#!/bin/bash

# ============================================
# MM-BusTicket Pro - Vercel Deploy Script
# ============================================
# Quick deployment script for Vercel
# Usage: ./deploy.sh [preview|prod]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DEPLOY_TYPE="${1:-prod}"

echo -e "${GREEN}"
echo "============================================"
echo "  MM-BusTicket Pro - Vercel Deployment"
echo "============================================"
echo -e "${NC}"

# Check Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Installing Vercel CLI...${NC}"
    npm install -g vercel
fi

# Build first
echo -e "${YELLOW}Building project...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed! Aborting deployment.${NC}"
    exit 1
fi

echo -e "${GREEN}Build successful!${NC}"

# Deploy
echo -e "${YELLOW}Deploying to Vercel (${DEPLOY_TYPE})...${NC}"

if [ "$DEPLOY_TYPE" = "prod" ]; then
    vercel --prod
else
    vercel
fi

echo -e "${GREEN}Deployment complete!${NC}"
