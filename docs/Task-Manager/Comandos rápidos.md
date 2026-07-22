---
tags:
  - task-manager
  - referencia
aliases:
  - Cheat sheet
  - Commands
created: 2026-06-23
---

# Comandos rápidos

## Desenvolvimento

```bash
pnpm dev              # servidor com hot reload
pnpm dev:up           # bootstrap completo (Docker + DB + dev)
pnpm check            # TypeScript
pnpm test             # Vitest
pnpm format           # Prettier
pnpm build            # build produção
pnpm start            # correr dist/
```

## Diagnóstico e manutenção

```bash
pnpm run doctor                    # diagnóstico local
pnpm run doctor -- --prod          # + produção GCP
pnpm run doctor -- --smoke         # smoke CI
pnpm run doctor -- --json          # JSON

pnpm run maintenance               # rotina semanal local
pnpm run maintenance -- --prod     # rotina + GCP
```

Ver [[Manutenção semanal]] e [[Doctor - Diagnóstico]].

## Migrations

| Comando | Uso |
|---------|-----|
| `pnpm db:generate` | Gerar SQL a partir do schema (**só dev**) |
| `pnpm db:migrate` | Aplicar migrations versionadas |
| `pnpm db:push` | `generate` + `migrate` — atalho dev |

```bash
# Dev — schema mudou
pnpm db:push

# Deploy / manutenção — só aplicar
pnpm db:migrate

# Produção
./scripts/deploy-gcp.sh migrate
```

## Deploy GCP

```bash
./scripts/deploy-gcp.sh all
./scripts/deploy-gcp.sh migrate
./scripts/deploy-gcp.sh deploy
./scripts/deploy-gcp.sh whoami
./scripts/deploy-gcp.sh url
```

Ver [[Deploy GCP]].

## Docker

```bash
docker compose up --build
docker compose up -d db          # só MySQL
```

## Git / qualidade rápida

```bash
pnpm check && pnpm test && pnpm build
```

## Health

```bash
curl http://localhost:3000/health
curl https://SUA-URL.run.app/health
```

## Ficheiros de config

| Ficheiro | Propósito |
|----------|-----------|
| `.env` | Local (gitignored) |
| `.env.example` | Template |
| `scripts/deploy.env` | GCP (gitignored) |
| `scripts/deploy.env.example` | Template GCP |
