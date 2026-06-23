#!/usr/bin/env bash
# Bootstraps and runs Task Manager Pro for local development:
#   - checks prerequisites
#   - ensures .env exists
#   - starts MySQL (Docker)
#   - installs dependencies
#   - applies database migrations
#   - starts the dev server
#
# Usage:
#   ./scripts/dev-up.sh
#   pnpm dev:up
#
# Options:
#   --skip-docker   Use an existing MySQL instance (DATABASE_URL must be reachable)
#   --skip-install  Skip pnpm install
#   --skip-db       Skip database migrations
#   --help          Show this help

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SKIP_DOCKER=0
SKIP_INSTALL=0
SKIP_DB=0

for arg in "$@"; do
  case "$arg" in
    --skip-docker) SKIP_DOCKER=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --help|-h)
      sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

read_env_var() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" | head -1 | cut -d= -f2- | sed 's/\r$//'
}

wait_for_mysql() {
  local attempts="${1:-45}"
  log "Waiting for MySQL to accept connections..."
  for ((i = 1; i <= attempts; i++)); do
    if docker compose exec -T db mysqladmin ping -h localhost -utaskmanager -ptaskmanager 2>/dev/null | grep -q alive; then
      log "MySQL is ready"
      return 0
    fi
    sleep 2
  done
  die "MySQL did not become ready in time"
}

ensure_docker_daemon() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$(uname -s)" == "Darwin" ]] && [[ -d "/Applications/Docker.app" ]]; then
    warn "Docker is not running — launching Docker Desktop..."
    open -a Docker
    for ((i = 1; i <= 60; i++)); do
      if docker info >/dev/null 2>&1; then
        log "Docker is ready"
        return 0
      fi
      sleep 2
    done
  fi

  die "Docker daemon is not running. Start Docker Desktop or pass --skip-docker with an external MySQL instance."
}

log "Checking prerequisites..."
require_cmd node
require_cmd docker

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node.js 20+ is required (found v$(node -v))"

if ! command -v pnpm >/dev/null 2>&1; then
  log "Enabling pnpm via corepack..."
  require_cmd corepack
  corepack enable
  corepack prepare pnpm@10.4.1 --activate
fi

if [[ ! -f .env ]]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
  warn "Review .env and set JWT_SECRET (and OAuth/email vars if needed)."
fi

if ! grep -qE '^DATABASE_URL=.+' .env; then
  die ".env is missing DATABASE_URL"
fi

if grep -qE '^JWT_SECRET=change-me-to-a-long-random-string$' .env; then
  warn "JWT_SECRET is still the example value — change it before deploying."
fi

DATABASE_URL="$(read_env_var DATABASE_URL .env)"
export DATABASE_URL

if [[ "$SKIP_DOCKER" -eq 0 ]]; then
  ensure_docker_daemon
  log "Starting MySQL container..."
  docker compose up db -d
  wait_for_mysql
else
  log "Skipping Docker (--skip-docker)"
fi

if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  log "Installing dependencies..."
  pnpm install
fi

log "Preparing local upload storage..."
mkdir -p uploads server/uploads

if [[ "$SKIP_DB" -eq 0 ]]; then
  log "Applying database migrations..."
  pnpm db:push
else
  log "Skipping database migrations (--skip-db)"
fi

APP_PORT="$(read_env_var PORT .env)"
APP_PORT="${APP_PORT:-3000}"
if lsof -i ":${APP_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  warn "Port ${APP_PORT} is already in use. Stop the other process or set PORT in .env."
  warn "Example: lsof -i :${APP_PORT}"
fi

if ! grep -qE '^GOOGLE_CLIENT_ID=.+' .env && ! grep -qE '^MICROSOFT_CLIENT_ID=.+' .env; then
  warn "OAuth is not configured — use dev login at http://localhost:${PORT:-3000}/api/dev/login"
fi

if ! grep -qE '^RESEND_API_KEY=.+' .env && ! grep -qE '^SMTP_HOST=.+' .env; then
  warn "Email is not configured — invites and notifications will not be sent."
fi

log "Starting development server..."
exec pnpm dev
