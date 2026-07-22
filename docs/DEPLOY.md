# Deploying Task Manager to Google Cloud

This is your single source of truth for deploying this app. It targets:

```
User → Google OAuth → Cloud Run (Docker container) → Cloud SQL (MySQL 8)
```

- **App** runs on **Cloud Run** (serverless containers, scales to zero).
- **Database** is **Cloud SQL for MySQL 8**.
- **Login** is **Google OAuth** (dev login does NOT work in production).
- **Cost:** ~$15–40/mo (smallest Cloud SQL tier + light Cloud Run traffic).

---

## 📍 You are here

| Phase | Status |
|-------|--------|
| Repo verified deploy-ready (Dockerfile, `/health`, OAuth, `PORT`) | ✅ done |
| Deploy script + config template written | ✅ done |
| `scripts/deploy.env` filled in with your values | ✅ done |
| `provision` — project, billing, APIs, Cloud SQL, secrets | ✅ done |
| OAuth client created + creds added to config | ✅ done |
| `migrate` — database schema applied | ✅ done |
| `deploy` — app live on Cloud Run | ✅ done |
| OAuth login-button fix (runtime `auth.providers`) in repo | ✅ done |
| Migration `0003` de-duplicated (idempotent `migrate`) | ✅ done |
| Redeploy with the latest code (`deploy`) | ⬜ **← NEXT** |
| OAuth redirect URI set in Google Console | ⬜ |
| Made yourself admin (`OWNER_OPEN_ID`) | ⬜ |

**Live service:** https://task-manager-c64ngueqda-uc.a.run.app/

> Update the checkboxes as you go so you never lose your place.

---

## What's already in the repo

Two files automate the deploy. You do **not** need to copy-paste dozens of `gcloud`
commands — the script does it.

| File | Purpose |
|------|---------|
| [scripts/deploy-gcp.sh](scripts/deploy-gcp.sh) | The deploy script. Idempotent — safe to re-run. |
| [scripts/deploy.env.example](scripts/deploy.env.example) | Config template. Copy it to `scripts/deploy.env` and fill in. |

`scripts/deploy.env` is **gitignored** (it holds passwords + secrets) — it will never be committed.

### The script's commands

```bash
./scripts/deploy-gcp.sh all          # provision + migrate + deploy (after config is complete)
./scripts/deploy-gcp.sh provision    # project, billing, APIs, Cloud SQL, registry, secrets
./scripts/deploy-gcp.sh migrate      # run DB migrations via Cloud SQL Auth Proxy
./scripts/deploy-gcp.sh deploy       # build image + deploy/update Cloud Run, prints URL
./scripts/deploy-gcp.sh whoami       # list DB users (to find your OWNER_OPEN_ID)
./scripts/deploy-gcp.sh url          # print the live service URL
./scripts/deploy-gcp.sh --help       # help
```

---

## Current deployment

| Setting | Value |
|---------|-------|
| GCP project | `mess1ah` |
| Region | `us-central1` |
| Cloud Run service | `task-manager` |
| Cloud SQL instance | `task-manager-db` |
| Database / user | `taskmanager` / `taskmanager` |
| Google account | luismg.design@gmail.com |

If you deploy to a different project, update `PROJECT_ID` in `scripts/deploy.env`.

---

## The full walkthrough

There's a chicken-and-egg with OAuth: you can't create the OAuth client until the
GCP project exists. So the first run has phases. Do them in order.

### Phase 1 — Fill in your config

```bash
cp scripts/deploy.env.example scripts/deploy.env
```

Open `scripts/deploy.env` and set:
- `PROJECT_ID` — globally unique GCP project ID (e.g. `mess1ah`)
- `BILLING_ACCOUNT` — an OPEN account from `gcloud billing accounts list` (only needed when creating a new project)
- `DB_PASSWORD` — a strong password for the app DB user
- `DB_ROOT_PASSWORD` — a strong password for the instance root (only used at instance creation)

Leave `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `OWNER_OPEN_ID` **blank** for now.

### Phase 2 — Provision infrastructure

```bash
./scripts/deploy-gcp.sh provision
```

This creates the project (if missing), links billing, enables APIs, creates the Cloud SQL
instance + database + user, the Docker registry, and the secrets. The Cloud SQL
instance takes a few minutes to create.

If you already created Cloud SQL manually, `provision` is safe to re-run — it skips
resources that already exist.

**Optional:** align Application Default Credentials with your project:

```bash
gcloud auth application-default set-quota-project YOUR_PROJECT_ID
```

### Phase 3 — Create the OAuth client

Now that the project exists:

1. [Google Cloud Console](https://console.cloud.google.com) → make sure your
   project is selected (top bar).
2. **APIs & Services → OAuth consent screen** → External → fill app name + your
   support email → save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application.**
4. You'll set the redirect URI *after* deploy (the script prints the exact value),
   so a placeholder is fine for now.
5. Copy the **Client ID** and **Client secret** into `scripts/deploy.env`:
   ```
   GOOGLE_CLIENT_ID=52566836591-....apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-....
   ```

### Phase 4 — Push the Google secret, migrate, deploy

```bash
./scripts/deploy-gcp.sh provision   # idempotent — now pushes the Google secret
./scripts/deploy-gcp.sh migrate     # downloads cloud-sql-proxy, applies schema
./scripts/deploy-gcp.sh deploy      # builds + deploys, prints your live URL
```

When `deploy` finishes it prints your service URL **and** the exact redirect URI to
configure next.

### Phase 5 — Finish OAuth

In Console → Credentials → your OAuth client, set **exactly**:

- **Authorized redirect URI:** `https://task-manager-c64ngueqda-uc.a.run.app/api/auth/callback`
- **Authorized JavaScript origin:** `https://task-manager-c64ngueqda-uc.a.run.app`

(Replace with your URL if it changed — run `./scripts/deploy-gcp.sh url`.)

Verify the app is up:

```bash
curl "$(./scripts/deploy-gcp.sh url)/health"
# → {"ok":true,"timestamp":"..."}
```

Open the URL in a browser. You should see **Sign in with Google**.

> **Note:** If you only see the title/subtitle with no login button, redeploy with the
> latest code. The app now detects OAuth providers at **runtime** via `auth.providers`
> (tRPC), because OAuth secrets are only available on Cloud Run after deploy — not
> during the Docker build.

### Phase 6 — Make yourself admin

Sign in once, then:

```bash
./scripts/deploy-gcp.sh whoami
```

Find your row, e.g. `openId = google:123456789`. Put it in `scripts/deploy.env`:

```
OWNER_OPEN_ID=google:123456789
```

`OWNER_OPEN_ID` must be the exact `openId` string (`google:...` or `microsoft:...`),
not a password or arbitrary text.

Then redeploy so it takes effect:

```bash
./scripts/deploy-gcp.sh deploy
```

Sign in again — you now have admin.

---

## Ongoing work

| When | Run |
|------|-----|
| Code changed | `./scripts/deploy-gcp.sh deploy` |
| Database schema changed | `./scripts/deploy-gcp.sh migrate` then `deploy` |
| Forgot the URL | `./scripts/deploy-gcp.sh url` |

---

## Optional extras (skip for MVP)

### Email (invites & notifications)
Add to `scripts/deploy.env` and re-run `provision` + `deploy`:
- **Resend (recommended):** set `EMAIL_FROM` and `RESEND_API_KEY`.
- **Gmail SMTP:** uses a Google App Password — not covered by the script yet;
  set `SMTP_*` env vars manually on the Cloud Run service if needed.

### File attachments ⚠️
Cloud Run disks are **ephemeral** — uploaded files disappear on redeploy. The app
supports S3/Forge-style storage via `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY`.
There is **no native Google Cloud Storage support** in the code today. For an MVP
without attachments you can ignore this.

### Custom domain (GoDaddy)

Use a **subdomain** (recommended), e.g. `tasks.yourdomain.com`. Root/apex domains
(`yourdomain.com`) are harder on Cloud Run — use a subdomain unless you want a load balancer.

#### Step 1 — Map the domain in Google Cloud

1. Open [Cloud Run → Domain mappings](https://console.cloud.google.com/run/domains?project=mess1ah)
2. Click **Add mapping**
3. Select service **task-manager**, region **us-central1**
4. Enter your hostname, e.g. `tasks.yourdomain.com`
5. Google shows the **DNS records** to add — keep this tab open

If Google asks you to verify domain ownership first, follow the link to add a
temporary TXT record at GoDaddy, then return and finish the mapping.

#### Step 2 — Add DNS records at GoDaddy

1. Log in to [GoDaddy](https://dcc.godaddy.com/) → **My Products** → your domain → **DNS**
2. Add the record(s) Google gave you. Usually for a subdomain:
   - **Type:** CNAME
   - **Name:** `tasks` (or whatever subdomain you chose — no domain suffix)
   - **Value:** the target Google shows (often `ghs.googlehosted.com` or a `*.run.app` host)
   - **TTL:** 1 hour (or default)
3. Remove conflicting records (old CNAME on the same name)
4. Save

DNS can take 15 minutes to a few hours. Google provisions HTTPS automatically once DNS propagates.

#### Step 3 — Point the app at your domain

In `scripts/deploy.env`:

```bash
CUSTOM_DOMAIN=https://tasks.yourdomain.com
```

Redeploy:

```bash
./scripts/deploy-gcp.sh deploy
```

#### Step 4 — Update Google OAuth

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials?project=mess1ah),
edit your OAuth client and **add** (keep the old `run.app` URIs until the custom domain works):

- **Authorized redirect URI:** `https://tasks.yourdomain.com/api/auth/callback`
- **Authorized JavaScript origin:** `https://tasks.yourdomain.com`

#### Step 5 — Verify

```bash
curl https://tasks.yourdomain.com/health
```

Open the custom URL in a browser and sign in with Google.

> **Tip:** Visit your app only via the custom domain after OAuth is updated. Cookies are
> per-domain — signing in on `*.run.app` does not carry over to `tasks.yourdomain.com`.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `provision` fails on billing | `BILLING_ACCOUNT` missing or closed. Use an OPEN one from `gcloud billing accounts list`. |
| `projects create` says ID taken | Project IDs are globally unique. The project may already exist — set `PROJECT_ID` to the existing ID and re-run `provision`. |
| Cloud SQL `INTERNAL_ERROR` on create | Often transient. Check `gcloud sql instances list` — the instance may exist despite the error. Wait until status is `RUNNABLE`, then continue. |
| `instance already exists` on create | Expected if you created it before. Skip create; run `databases create` / `users create` only if missing. |
| `zsh: command not found: --flag` | Broken multi-line paste. No blank lines between `\` continuations. Use one-line commands or paste carefully. |
| `migrate` fails: table already exists | Fixed in repo — migration `0003` no longer re-creates `0002`'s tables. Pull latest and re-run `migrate`. For a DB already broken by the old `0003`, see [Migration journal mismatch](#migration-journal-mismatch). |
| Cloud Build fails: `patches/wouter@...` not found | Fixed in Dockerfile — `patches/` must be copied before `pnpm install`. Pull latest and redeploy. |
| Page shows title only, no login button | OAuth was checked at build time (always false in Cloud Run). Pull latest code (runtime `auth.providers`) and redeploy. |
| App loads but nothing saves / 500s | DB connection. Check `db-url-secret` and that `migrate` ran. |
| OAuth `redirect_uri_mismatch` | Redirect URI in Google Console must be **exactly** `https://YOUR-URL/api/auth/callback`. |
| Sign-in works but you're not admin | `OWNER_OPEN_ID` not set or wrong format. Run `whoami`, copy the exact `openId`, redeploy. |
| `migrate` can't find mysql client | Only `whoami` needs the `mysql` CLI (`brew install mysql-client`). `migrate` itself does not. |
| ADC quota project warning | Run `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`. |

### Migration journal mismatch

**This is now fixed at the repo level.** Migration `0003_sticky_tyrannus.sql`
previously re-`CREATE`d the tables already created by `0002` (`activity_log`,
`task_attachments`, `task_comments`, `user_preferences`) plus a few statements that
`0002` already applied, so a fresh `migrate` failed with `Table ... already exists`.
`0003` now carries **only the genuine delta** (a handful of column-type tweaks), so
`drizzle-kit migrate` runs cleanly from `0000` → `0003` with no manual journal hacks.

You only need the manual fix below if a database was **already** half-migrated by the
old, buggy `0003` (all tables present but `0003` not recorded in
`__drizzle_migrations`). In that case, stamp `0003` as applied:

```bash
# Start proxy in another terminal, or let the migrate script do it
source scripts/deploy.env
.cache/cloud-sql-proxy "$PROJECT_ID:$REGION:task-manager-db" --port 3307
```

```sql
-- hash is the SHA-256 of the CURRENT drizzle/0003_sticky_tyrannus.sql
INSERT INTO __drizzle_migrations (hash, created_at)
VALUES ('<sha256-of-0003-file>', 1782190365174);
```

Compute the hash with `shasum -a 256 drizzle/0003_sticky_tyrannus.sql`. Re-run
`./scripts/deploy-gcp.sh migrate` — it should pass. For a brand-new database you can
ignore this entirely.

### Shell tips for `gcloud` multi-line commands

**Bad** (blank lines break continuation):

```bash
gcloud sql users create taskmanager \

--instance=task-manager-db \

--password='your-password'
```

**Good:**

```bash
gcloud sql users create taskmanager \
  --instance=task-manager-db \
  --password='your-password'
```

Use single quotes for passwords containing `%` or `@`.

---

## Reference: what was verified in the code

These were checked against the actual repo before writing the script:

- `/health` endpoint exists — [server/_core/index.ts](server/_core/index.ts)
- OAuth callback path is `/api/auth/callback` — [server/_core/oauth.ts](server/_core/oauth.ts)
- OAuth providers exposed at runtime via `auth.providers` — [server/routers.ts](server/routers.ts)
- App honors Cloud Run's `PORT` env var — [server/_core/index.ts](server/_core/index.ts)
- DB driver is `mysql2`, connects via `DATABASE_URL` — [server/db.ts](server/db.ts)
- `OWNER_OPEN_ID` grants admin — [server/_core/env.ts](server/_core/env.ts)
- Migrations run via `pnpm db:migrate` in deploy (`./scripts/deploy-gcp.sh migrate`); use `pnpm db:push` only in local dev when the schema changes
- Docker build copies `patches/` before `pnpm install` — [Dockerfile](Dockerfile)
