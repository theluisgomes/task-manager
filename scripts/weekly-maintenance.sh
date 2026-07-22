#!/usr/bin/env bash
# Weekly maintenance routine for Task Manager Pro.
#
# Usage:
#   ./scripts/weekly-maintenance.sh           # local checks + conservative auto-fix
#   ./scripts/weekly-maintenance.sh --prod    # include production health + Cloud SQL checks
#   pnpm maintenance
#   pnpm maintenance -- --prod
#
# Options:
#   --prod        Run production checks via doctor --prod
#   --skip-fix    Skip conservative auto-fixes (format, migrate, cleanup)
#   --skip-build  Skip production build
#   --help        Show this help

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROD=0
SKIP_FIX=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --prod) PROD=1 ;;
    --skip-fix) SKIP_FIX=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --help|-h)
      sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)" >&2
      exit 1
      ;;
  esac
done

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

REPORT_DIR="$ROOT_DIR/reports"
mkdir -p "$REPORT_DIR"
DATE_TAG="$(date +%Y-%m-%d)"
REPORT_FILE="$REPORT_DIR/maintenance-${DATE_TAG}.md"
AUTOFIX_LOG=()

append_report() {
  printf '%s\n' "$1" >> "$REPORT_FILE"
}

read_env_var() {
  local key="$1"
  local file="$2"
  grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed 's/\r$//' | sed 's/^["'\'']//;s/["'\'']$//'
}

is_local_database() {
  local url="${DATABASE_URL:-}"
  [[ -z "$url" ]] && return 1
  [[ "$url" =~ @(127\.0\.0\.1|localhost)(:|/) ]] && return 0
  return 1
}

run_doctor_json() {
  local extra_args=("$@")
  pnpm run doctor --json --skip-deps "${extra_args[@]}" 2>/dev/null || true
}

doctor_status() {
  local json="$1"
  node -e "
    const d = JSON.parse(process.argv[1]);
    const w = d.status || 'FAIL';
    process.stdout.write(w);
  " "$json" 2>/dev/null || echo "FAIL"
}

has_pending_migrations() {
  local json="$1"
  node -e "
    const d = JSON.parse(process.argv[1]);
    const r = (d.results || []).find(x => x.name === 'db.local.migrations');
    process.exit(r && r.status === 'WARN' ? 0 : 1);
  " "$json" 2>/dev/null
}

# ─── Phase 1: Initial inspection ─────────────────────────────────────────────
log "Phase 1 — Inspection (doctor)"
DOCTOR_ARGS=()
[[ "$PROD" -eq 1 ]] && DOCTOR_ARGS+=(--prod)
DOCTOR_JSON="$(run_doctor_json "${DOCTOR_ARGS[@]}")"
DOCTOR_STATUS="$(doctor_status "$DOCTOR_JSON")"

# ─── Phase 2: Quality gates ──────────────────────────────────────────────────
log "Phase 2 — Typecheck and tests"
pnpm check
pnpm test

# ─── Phase 3: Conservative auto-fix ──────────────────────────────────────────
if [[ "$SKIP_FIX" -eq 0 ]]; then
  log "Phase 3 — Conservative auto-fix"

  log "Formatting code (pnpm format)"
  pnpm format
  AUTOFIX_LOG+=("Ran pnpm format")

  log "Verifying lockfile (pnpm install --frozen-lockfile)"
  pnpm install --frozen-lockfile
  AUTOFIX_LOG+=("Verified lockfile with pnpm install --frozen-lockfile")

  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi

  if has_pending_migrations "$DOCTOR_JSON"; then
    if is_local_database; then
      log "Applying pending migrations (pnpm db:migrate)"
      pnpm db:migrate
      AUTOFIX_LOG+=("Applied pending migrations via pnpm db:migrate")
    else
      warn "Pending migrations detected but DATABASE_URL is not local — skipping auto-migrate"
      AUTOFIX_LOG+=("Skipped db:migrate — DATABASE_URL is not localhost")
    fi
  fi
else
  log "Phase 3 — Skipped (--skip-fix)"
fi

# ─── Phase 4: Build ───────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "Phase 4 — Production build"
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi
  export DATABASE_URL="${DATABASE_URL:-mysql://root:root@127.0.0.1:3306/taskmanager}"
  export JWT_SECRET="${JWT_SECRET:-maintenance-build-secret}"
  pnpm build
else
  log "Phase 4 — Skipped (--skip-build)"
fi

# ─── Phase 5: Post-fix doctor ────────────────────────────────────────────────
log "Phase 5 — Post-fix inspection"
DOCTOR_JSON_FINAL="$(run_doctor_json "${DOCTOR_ARGS[@]}")"
DOCTOR_STATUS_FINAL="$(doctor_status "$DOCTOR_JSON_FINAL")"

# ─── Phase 6: Report ─────────────────────────────────────────────────────────
log "Phase 6 — Writing report to $REPORT_FILE"

GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

{
  echo "# Maintenance Report — ${DATE_TAG}"
  echo ""
  echo "- **Timestamp:** ${TIMESTAMP}"
  echo "- **Branch:** ${GIT_BRANCH}"
  echo "- **Commit:** ${GIT_COMMIT}"
  echo "- **Mode:** $([ "$PROD" -eq 1 ] && echo 'local + production' || echo 'local only')"
  echo ""
  echo "## Summary"
  echo ""
  echo "- Initial doctor status: **${DOCTOR_STATUS}**"
  echo "- Final doctor status: **${DOCTOR_STATUS_FINAL}**"
  echo ""
  echo "## Auto-fixes applied"
  echo ""
  if [[ ${#AUTOFIX_LOG[@]} -eq 0 ]]; then
    echo "_None_"
  else
    for item in "${AUTOFIX_LOG[@]}"; do
      echo "- ${item}"
    done
  fi
  echo ""
  echo "## Doctor results (final)"
  echo ""
  echo '```json'
  echo "$DOCTOR_JSON_FINAL"
  echo '```'
  echo ""
  echo "## Manual review checklist"
  echo ""
  echo "- [ ] Any WARN/FAIL in production? Investigate Cloud Run logs"
  echo "- [ ] \`pnpm outdated\` shows major version bumps? Plan a separate upgrade"
  echo "- [ ] Integrity checks showed orphans? Decide on manual cleanup"
  echo "- [ ] Cloud SQL backup verified this month? (GCP Console)"
  echo "- [ ] Update docs/TODO.md if features were completed this week"
  echo ""
} > "$REPORT_FILE"

log "Report saved: $REPORT_FILE"

if [[ "$DOCTOR_STATUS_FINAL" == "FAIL" ]]; then
  die "Maintenance completed with FAIL status — see $REPORT_FILE"
fi

if [[ "$DOCTOR_STATUS_FINAL" == "WARN" ]]; then
  warn "Maintenance completed with warnings — see $REPORT_FILE"
  exit 2
fi

log "Maintenance completed successfully"
exit 0
