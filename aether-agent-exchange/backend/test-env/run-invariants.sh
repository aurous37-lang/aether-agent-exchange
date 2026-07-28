#!/usr/bin/env bash
# ─── Invariant Regression Runner ────────────────────────────────
# Delegates to the controlled TypeScript runner so DB isolation,
# known-port startup, health checks, and teardown stay in one place.
# Usage:  bash test-env/run-invariants.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

BOLD=$'\033[1m'
CYAN=$'\033[36m'
GREEN=$'\033[32m'
RED=$'\033[31m'
DIM=$'\033[2m'
RESET=$'\033[0m'

echo ""
echo "${BOLD}${CYAN}=== Invariant Regression Runner ===${RESET}"
echo ""
npx tsx test-env/run-all.ts --only-invariants "$@"
