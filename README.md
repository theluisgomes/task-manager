# Task Manager Pro

Team-ready project management with Kanban boards, workload tracking, and Finance KPI dashboards.

## Features

- **Kanban boards** — drag-and-drop tasks, columns, priorities, due dates
- **Team collaboration** — project membership, email invites, workload view
- **Authorization** — project-scoped access control (owner / admin / member)
- **Comments & attachments** — task discussions and file uploads
- **Email notifications** — assignments, @mentions, invite accepted
- **Finance KPI** — revenue, budget, variance charts with CSV export
- **Auth** — Google & Microsoft OAuth (dev login when OAuth not configured)
- **Dark mode** — toggle from the user menu

## Prerequisites

- Node.js 20+
- pnpm 10+
- MySQL 8+

## Quick start (local)

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET at minimum

pnpm install
pnpm db:push
pnpm dev
```

Open http://localhost:3000 — without OAuth credentials you'll be redirected to dev login.

## Environment variables

See [`.env.example`](.env.example) for the full list. Required for production:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Secret for session cookies |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (optional pair) |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Microsoft OAuth (optional pair) |
| `OAUTH_REDIRECT_BASE_URL` | Public app URL, e.g. `https://tasks.yourcompany.com` |
| `OWNER_OPEN_ID` | OpenID of first admin (`google:...` or `microsoft:...`) |
| `EMAIL_FROM` + `RESEND_API_KEY` or SMTP vars | For invite/notification emails |

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Development server with hot reload |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm check` | TypeScript check |
| `pnpm test` | Run Vitest tests |
| `pnpm db:generate` | Generate a new migration from schema changes (dev only) |
| `pnpm db:migrate` | Apply versioned migrations (deploy / maintenance) |
| `pnpm db:push` | Generate and apply migrations (local dev shortcut) |
| `pnpm run doctor` | Diagnostic checks (env, DB, integrity, deps) |
| `pnpm run maintenance` | Weekly maintenance routine — see [docs/MAINTENANCE.md](docs/MAINTENANCE.md) |
| `pnpm dev:up` | Bootstrap local dev (Docker MySQL + migrations + server) |

## Docker

```bash
docker compose up --build
```

This starts MySQL and the app. Set OAuth and email vars in `docker-compose.yml` or a `.env` file.

## Deploy to Google Cloud

For production on **Cloud Run + Cloud SQL**, see **[docs/DEPLOY.md](docs/DEPLOY.md)** — step-by-step
guide with `scripts/deploy-gcp.sh` and `scripts/deploy.env`.

## OAuth setup

### Google
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Google+ API / OAuth consent screen
3. Create OAuth 2.0 credentials (Web application)
4. Redirect URI: `{OAUTH_REDIRECT_BASE_URL}/api/auth/callback`

### Microsoft
1. Register an app in [Azure Portal](https://portal.azure.com/) → App registrations
2. Add redirect URI: `{OAUTH_REDIRECT_BASE_URL}/api/auth/callback`
3. Create a client secret

## Team onboarding

1. First user signs in → set their `openId` as `OWNER_OPEN_ID` for admin role
2. Create a project (owner is auto-added as member)
3. Invite teammates via **Team → Invite Member**
4. Invitee receives email, clicks link, signs in, and joins the project

## Health check

```
GET /health → { "ok": true, "db": "connected", "timestamp": "..." }
```

Returns HTTP **503** when the database is unreachable.

## Maintenance

Weekly inspection and conservative auto-fixes: **[docs/MAINTENANCE.md](docs/MAINTENANCE.md)**

Full documentation index: **[docs/README.md](docs/README.md)** (deploy, backlog, design tokens, Obsidian vault).

Obsidian vault (notas interligadas): **[docs/Task-Manager/](docs/Task-Manager/)** — abrir a pasta como cofre no Obsidian; começar em `Task Manager Pro.md`.

```bash
pnpm run maintenance          # local
pnpm run maintenance -- --prod   # local + GCP production checks
```

## License

MIT
