#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "========================================"
echo "  Aether Agent Exchange — Local Dev"
echo "========================================"
echo ""

# ─── Backend setup ─────────────────────────────────────────────
cd "$ROOT/backend"

if [ ! -d node_modules ]; then
  echo "[backend] Installing dependencies..."
  npm install
fi

if [ ! -f prisma/dev.db ]; then
  echo "[backend] Creating SQLite database..."
  npx prisma generate
  npx prisma db push
  echo "[backend] Seeding demo data..."
  npx tsx prisma/seed.ts
fi

# ─── Frontend setup ───────────────────────────────────────────
cd "$ROOT/frontend"

if [ ! -d node_modules ]; then
  echo "[frontend] Installing dependencies..."
  npm install
fi

# ─── Launch ────────────────────────────────────────────────────
echo ""
echo "Starting backend (port 4000) and frontend (port 5173)..."
echo "  UI:  http://localhost:5173"
echo "  API: http://localhost:4000/api"
echo ""
echo "Demo users are wallet-based — connect any wallet to browse."
echo "Press Ctrl+C to stop both servers."
echo ""

cd "$ROOT"
npx concurrently \
  --names "backend,frontend" \
  --prefix-colors "cyan,magenta" \
  "cd backend && npm run dev" \
  "cd frontend && npm run dev"
