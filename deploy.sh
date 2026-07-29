#!/bin/bash
set -e

REPO_DIR="/root/whatsapp_bot_techDr/backend"

echo "==> Pulling latest code..."
cd "$REPO_DIR"
git pull origin main

echo "==> Installing dependencies..."
npm ci --omit=dev

echo "==> Building..."
npm run build

echo "==> Reloading PM2..."
pm2 reload whatsapp-bot-backend --update-env

echo "==> Done. Backend is live."
pm2 status whatsapp-bot-backend
