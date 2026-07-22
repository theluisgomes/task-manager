---
tags:
  - task-manager
  - manutencao
  - diagnostico
aliases:
  - Doctor
  - Diagnose
created: 2026-06-23
---

# Doctor — Diagnóstico

Suite de diagnóstico read-only do Task Manager. Ficheiro: `scripts/doctor.ts`

Usado pela [[Manutenção semanal]] e pelo CI (`--smoke`).

## Comandos

```bash
pnpm run doctor                  # checks locais
pnpm run doctor -- --prod        # local + produção
pnpm run doctor -- --smoke       # mínimo (CI)
pnpm run doctor -- --json        # saída JSON
pnpm run doctor -- --skip-deps   # sem audit/outdated
pnpm run diagnose                # alias
```

## Exit codes

| Código | Status |
|--------|--------|
| `0` | Tudo OK |
| `1` | Pelo menos um FAIL |
| `2` | Só WARN (sem FAIL) |

## Checks locais

### Pré-requisitos
- Node 20+
- pnpm instalado

### Ambiente (`checkEnv`)
- `DATABASE_URL`, `JWT_SECRET` presentes
- Em produção: JWT não pode ser `local-dev-jwt-secret`
- OAuth: WARN se nenhum provider configurado

### Base de dados (`checkDatabase`)
- `SELECT 1` via `pingDatabase()` em `server/db.ts`
- Versão MySQL
- Migrations: compara journal (`drizzle/meta/_journal.json`) com `__drizzle_migrations`

### Integridade (`checkIntegrity`) — read-only

```sql
-- Tasks sem coluna válida
SELECT COUNT(*) FROM tasks t
LEFT JOIN columns c ON t.columnId = c.id
WHERE c.id IS NULL;

-- Members sem user
SELECT COUNT(*) FROM project_members pm
LEFT JOIN users u ON pm.userId = u.id
WHERE u.id IS NULL;

-- Invites expirados ainda pending
SELECT COUNT(*) FROM team_invites
WHERE status = 'pending' AND expiresAt < NOW();
```

Também verifica ficheiros de attachment no disco (storage local, sem Forge/S3).

### Health (`checkHealth`)
- `GET /health` — espera `{ ok: true, db: "connected" }`
- HTTP 503 se DB indisponível
- Local: WARN se servidor não estiver a correr
- Produção: FAIL se health falhar

### Disco
- Tamanho de `uploads/`, `server/uploads/`, `node_modules/`

### Dependências
- `pnpm audit --audit-level=moderate`
- `pnpm outdated` (primeiras 15 linhas)

## Modo `--prod`

1. Lê `scripts/deploy.env`
2. Resolve URL: `CUSTOM_DOMAIN` ou `gcloud run services describe`
3. `GET /health` na produção
4. Inicia Cloud SQL Auth Proxy (porta 3308)
5. SELECT read-only na base de produção
6. Encerra proxy

> [!warning] Requisitos para `--prod`
> - `scripts/deploy.env` preenchido
> - `gcloud auth login` activo
> - Proxy em `.cache/cloud-sql-proxy` (correr `deploy-gcp.sh migrate` uma vez)

## Modo `--smoke` (CI)

Só executa:
- `db.local.ping`
- `db.local.migrations`

Usado após `pnpm db:migrate` no GitHub Actions.

## Health endpoint

Ver [[Arquitetura#Health check]]:

```json
{ "ok": true, "db": "connected", "timestamp": "..." }
```

```json
{ "ok": false, "db": "unavailable", "timestamp": "..." }
```

Implementado em `server/_core/index.ts` com `pingDatabase()` de `server/db.ts`.
