#!/usr/bin/env bash
# Deploys Task Manager to Google Cloud: Cloud Run (app) + Cloud SQL (MySQL 8).
#
# All steps are idempotent — safe to re-run. Configuration and secrets are read
# from scripts/deploy.env (copy scripts/deploy.env.example to create it).
#
# Usage:
#   ./scripts/deploy-gcp.sh all          Provision + migrate + deploy (first run)
#   ./scripts/deploy-gcp.sh provision    Project, APIs, Cloud SQL, registry, secrets
#   ./scripts/deploy-gcp.sh migrate      Run DB migrations via Cloud SQL Auth Proxy
#   ./scripts/deploy-gcp.sh deploy       Build image + deploy/update Cloud Run
#   ./scripts/deploy-gcp.sh whoami       List users in the DB (find your OWNER_OPEN_ID)
#   ./scripts/deploy-gcp.sh url          Print the deployed service URL
#   ./scripts/deploy-gcp.sh --help       Show this help
#
# After the first `all`:
#   1. Set the OAuth redirect URI in Google Console (the script prints it).
#   2. Run `whoami`, put your openId in OWNER_OPEN_ID, then `deploy` again.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG_FILE="scripts/deploy.env"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"; }

show_help() { sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; }

load_config() {
  [[ -f "$CONFIG_FILE" ]] || die "Missing $CONFIG_FILE — copy scripts/deploy.env.example and fill it in."
  # shellcheck disable=SC1090
  set -a; source "$CONFIG_FILE"; set +a

  : "${PROJECT_ID:?Set PROJECT_ID in $CONFIG_FILE}"
  : "${REGION:?Set REGION in $CONFIG_FILE}"
  : "${SERVICE_NAME:?Set SERVICE_NAME in $CONFIG_FILE}"
  : "${SQL_INSTANCE:?Set SQL_INSTANCE in $CONFIG_FILE}"
  : "${DB_NAME:?Set DB_NAME in $CONFIG_FILE}"
  : "${DB_USER:?Set DB_USER in $CONFIG_FILE}"

  IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/task-manager/app:latest"
}

# Cloud SQL instance connection name, e.g. project:region:instance
sql_connection() {
  gcloud sql instances describe "$SQL_INSTANCE" \
    --project="$PROJECT_ID" --format='value(connectionName)'
}

service_url() {
  gcloud run services describe "$SERVICE_NAME" \
    --project="$PROJECT_ID" --region="$REGION" \
    --format='value(status.url)' 2>/dev/null
}

# Public URL used for OAuth redirects (custom domain if set, else Cloud Run URL).
public_url() {
  if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
    echo "${CUSTOM_DOMAIN%/}"
  else
    service_url
  fi
}

# Create a secret if absent, otherwise add a new version. Stdin = value.
put_secret() {
  local name="$1"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" >/dev/null 2>&1; then
    gcloud secrets versions add "$name" --project="$PROJECT_ID" --data-file=- >/dev/null
  else
    gcloud secrets create "$name" --project="$PROJECT_ID" \
      --replication-policy=automatic --data-file=- >/dev/null
  fi
  log "Secret ready: $name"
}

# ─── provision ────────────────────────────────────────────────────────────────
cmd_provision() {
  require_cmd gcloud
  load_config

  # Step 0 — project + billing
  if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
    log "Creating project $PROJECT_ID..."
    gcloud projects create "$PROJECT_ID"
  else
    log "Project $PROJECT_ID already exists."
  fi
  gcloud config set project "$PROJECT_ID" >/dev/null

  if ! gcloud billing projects describe "$PROJECT_ID" \
        --format='value(billingEnabled)' 2>/dev/null | grep -qi true; then
    [[ -n "${BILLING_ACCOUNT:-}" ]] || die \
      "Billing not enabled. Set BILLING_ACCOUNT in $CONFIG_FILE (gcloud billing accounts list)."
    log "Linking billing account $BILLING_ACCOUNT..."
    gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
  else
    log "Billing already enabled."
  fi

  # Step 1 — APIs
  log "Enabling APIs (this can take a minute)..."
  gcloud services enable \
    run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
    cloudbuild.googleapis.com secretmanager.googleapis.com \
    --project="$PROJECT_ID"

  # Step 2 — Cloud SQL
  if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1; then
    : "${DB_ROOT_PASSWORD:?Set DB_ROOT_PASSWORD in $CONFIG_FILE}"
    log "Creating Cloud SQL instance $SQL_INSTANCE (a few minutes)..."
    gcloud sql instances create "$SQL_INSTANCE" \
      --project="$PROJECT_ID" --database-version=MYSQL_8_0 \
      --tier="${SQL_TIER:-db-f1-micro}" --region="$REGION" \
      --root-password="$DB_ROOT_PASSWORD"
  else
    log "Cloud SQL instance $SQL_INSTANCE already exists."
  fi

  gcloud sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID" >/dev/null 2>&1 \
    || gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" --project="$PROJECT_ID"

  : "${DB_PASSWORD:?Set DB_PASSWORD in $CONFIG_FILE}"
  if gcloud sql users list --instance="$SQL_INSTANCE" --project="$PROJECT_ID" \
        --format='value(name)' | grep -qx "$DB_USER"; then
    log "Resetting password for DB user $DB_USER..."
    gcloud sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" \
      --project="$PROJECT_ID" --password="$DB_PASSWORD"
  else
    gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" \
      --project="$PROJECT_ID" --password="$DB_PASSWORD"
  fi

  # Artifact Registry
  gcloud artifacts repositories describe task-manager \
      --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1 \
    || gcloud artifacts repositories create task-manager \
        --repository-format=docker --location="$REGION" --project="$PROJECT_ID"

  # Secrets
  local conn; conn="$(sql_connection)"
  local db_url="mysql://${DB_USER}:${DB_PASSWORD}@localhost/${DB_NAME}?socketPath=/cloudsql/${conn}"

  local jwt="${JWT_SECRET:-}"
  [[ -n "$jwt" ]] || { jwt="$(openssl rand -base64 32)"; log "Generated JWT_SECRET."; }

  printf '%s' "$jwt"      | put_secret jwt-secret
  printf '%s' "$db_url"   | put_secret db-url-secret
  [[ -n "${GOOGLE_CLIENT_SECRET:-}" ]] && printf '%s' "$GOOGLE_CLIENT_SECRET" | put_secret google-client-secret
  [[ -n "${RESEND_API_KEY:-}" ]]       && printf '%s' "$RESEND_API_KEY"       | put_secret resend-api-key

  # Grant the Cloud Run runtime SA (default compute SA) access to the secrets
  local pnum sa
  pnum="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
  sa="${pnum}-compute@developer.gserviceaccount.com"
  for s in jwt-secret db-url-secret google-client-secret resend-api-key; do
    gcloud secrets describe "$s" --project="$PROJECT_ID" >/dev/null 2>&1 || continue
    gcloud secrets add-iam-policy-binding "$s" --project="$PROJECT_ID" \
      --member="serviceAccount:${sa}" --role="roles/secretmanager.secretAccessor" >/dev/null
  done

  log "Provision complete. Cloud SQL connection: $conn"
}

# ─── migrate ──────────────────────────────────────────────────────────────────
cmd_migrate() {
  require_cmd gcloud; require_cmd pnpm
  load_config
  : "${DB_PASSWORD:?Set DB_PASSWORD in $CONFIG_FILE}"

  local proxy_bin conn
  conn="$(sql_connection)"

  if command -v cloud-sql-proxy >/dev/null 2>&1; then
    proxy_bin="cloud-sql-proxy"
  else
    proxy_bin="$ROOT_DIR/.cache/cloud-sql-proxy"
    if [[ ! -x "$proxy_bin" ]]; then
      log "Downloading Cloud SQL Auth Proxy..."
      mkdir -p "$ROOT_DIR/.cache"
      local os arch
      os="$(uname -s | tr '[:upper:]' '[:lower:]')"
      arch="$(uname -m)"; [[ "$arch" == "x86_64" ]] && arch="amd64"; [[ "$arch" == "arm64" ]] && arch="arm64"
      curl -fsSL -o "$proxy_bin" \
        "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.${os}.${arch}"
      chmod +x "$proxy_bin"
    fi
  fi

  log "Starting Cloud SQL Auth Proxy for $conn..."
  "$proxy_bin" "$conn" --port 3307 &
  local proxy_pid=$!
  trap 'kill "$proxy_pid" 2>/dev/null || true' EXIT

  # wait for the proxy to accept connections
  for _ in $(seq 1 30); do
    (exec 3<>/dev/tcp/127.0.0.1/3307) 2>/dev/null && { exec 3>&- 3<&-; break; }
    sleep 1
  done

  log "Running migrations (pnpm db:migrate)..."
  DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3307/${DB_NAME}" pnpm db:migrate

  kill "$proxy_pid" 2>/dev/null || true
  trap - EXIT
  log "Migrations applied."
}

# ─── deploy ───────────────────────────────────────────────────────────────────
cmd_deploy() {
  require_cmd gcloud
  load_config
  : "${GOOGLE_CLIENT_ID:?Set GOOGLE_CLIENT_ID in $CONFIG_FILE}"

  local conn; conn="$(sql_connection)"

  log "Building image with Cloud Build → $IMAGE"
  gcloud builds submit --project="$PROJECT_ID" --tag "$IMAGE"

  # Assemble env vars and secrets
  local env_vars="NODE_ENV=production,VITE_APP_ID=${VITE_APP_ID:-task-manager-pro},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}"
  [[ -n "${OWNER_OPEN_ID:-}" ]] && env_vars="${env_vars},OWNER_OPEN_ID=${OWNER_OPEN_ID}"
  [[ -n "${EMAIL_FROM:-}" ]]    && env_vars="${env_vars},EMAIL_FROM=${EMAIL_FROM}"

  local secrets="JWT_SECRET=jwt-secret:latest,DATABASE_URL=db-url-secret:latest"
  gcloud secrets describe google-client-secret --project="$PROJECT_ID" >/dev/null 2>&1 \
    && secrets="${secrets},GOOGLE_CLIENT_SECRET=google-client-secret:latest"
  gcloud secrets describe resend-api-key --project="$PROJECT_ID" >/dev/null 2>&1 \
    && secrets="${secrets},RESEND_API_KEY=resend-api-key:latest"

  log "Deploying to Cloud Run..."
  gcloud run deploy "$SERVICE_NAME" \
    --project="$PROJECT_ID" --region="$REGION" --platform=managed \
    --image="$IMAGE" --allow-unauthenticated --port=8080 \
    --add-cloudsql-instances="$conn" \
    --set-env-vars="$env_vars" \
    --set-secrets="$secrets" \
    --min-instances=0 --max-instances=3 --memory=512Mi

  # Set OAUTH_REDIRECT_BASE_URL to the public URL (custom domain or Cloud Run default).
  local url; url="$(public_url)"
  [[ -n "$url" ]] || die "Could not determine service URL — set CUSTOM_DOMAIN in $CONFIG_FILE or check Cloud Run."
  log "Setting OAUTH_REDIRECT_BASE_URL=$url"
  gcloud run services update "$SERVICE_NAME" \
    --project="$PROJECT_ID" --region="$REGION" \
    --update-env-vars="OAUTH_REDIRECT_BASE_URL=${url}" >/dev/null

  log "Deployed: $url"
  if [[ -n "${CUSTOM_DOMAIN:-}" ]]; then
    printf '\n\033[1;33mnote:\033[0m CUSTOM_DOMAIN is set. Ensure DNS + Cloud Run domain mapping are active.\n'
  fi
  printf '\n\033[1;32mNEXT:\033[0m In Google Console → Credentials → your OAuth client, set:\n'
  printf '   Authorized redirect URI:   %s/api/auth/callback\n' "$url"
  printf '   Authorized JS origin:      %s\n\n' "$url"
  printf 'Verify:  curl %s/health\n' "$url"
}

# ─── whoami ───────────────────────────────────────────────────────────────────
cmd_whoami() {
  require_cmd gcloud
  load_config
  : "${DB_PASSWORD:?Set DB_PASSWORD in $CONFIG_FILE}"
  command -v mysql >/dev/null 2>&1 || die "mysql client not found (brew install mysql-client)."

  local conn; conn="$(sql_connection)"
  local proxy_bin="cloud-sql-proxy"
  command -v cloud-sql-proxy >/dev/null 2>&1 || proxy_bin="$ROOT_DIR/.cache/cloud-sql-proxy"
  [[ -x "$proxy_bin" ]] || die "Cloud SQL proxy not found — run 'migrate' once to fetch it."

  "$proxy_bin" "$conn" --port 3307 &
  local proxy_pid=$!
  trap 'kill "$proxy_pid" 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    (exec 3<>/dev/tcp/127.0.0.1/3307) 2>/dev/null && { exec 3>&- 3<&-; break; }; sleep 1
  done

  mysql -h 127.0.0.1 -P 3307 -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    -e "SELECT id, openId, email, role FROM users;"
  kill "$proxy_pid" 2>/dev/null || true
  trap - EXIT
}

cmd_url() {
  load_config
  public_url || service_url
}

main() {
  local cmd="${1:-all}"
  case "$cmd" in
    all)       cmd_provision; cmd_migrate; cmd_deploy ;;
    provision) cmd_provision ;;
    migrate)   cmd_migrate ;;
    deploy)    cmd_deploy ;;
    whoami)    cmd_whoami ;;
    url)       cmd_url ;;
    --help|-h|help) show_help ;;
    *) die "Unknown command: $cmd (try --help)" ;;
  esac
}

main "$@"
