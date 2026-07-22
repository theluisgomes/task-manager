---
tags:
  - task-manager
  - dev
aliases:
  - Local dev
  - Setup local
created: 2026-06-23
---

# Desenvolvimento local

## Pré-requisitos

- Node.js 20+
- pnpm 10+
- MySQL 8+ (Docker recomendado)
- Docker (opcional, para `docker compose`)

## Quick start

```bash
cp .env.example .env
# Editar .env — mínimo: DATABASE_URL e JWT_SECRET

pnpm install
pnpm db:push      # dev: generate + migrate
pnpm dev
```

Abrir http://localhost:3000 — sem OAuth, redireciona para dev login.

## Bootstrap automático

```bash
pnpm dev:up
# ou
./scripts/dev-up.sh
```

Faz: verifica Node/Docker, cria `.env`, sobe MySQL, `pnpm install`, `pnpm db:push`, `pnpm dev`.

Flags: `--skip-docker`, `--skip-install`, `--skip-db`

## Docker Compose

```bash
docker compose up --build
```

Serviços:
- `db` — MySQL 8 na porta 3306
- `app` — app na porta 3000

Credenciais default do compose:
- user: `taskmanager`
- password: `taskmanager`
- database: `taskmanager`

## Variáveis de ambiente

Ficheiro: `.env` (ver `.env.example`)

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | MySQL connection string |
| `JWT_SECRET` | Sim | Sessão / cookies |
| `GOOGLE_CLIENT_ID` / `SECRET` | Prod | OAuth Google |
| `MICROSOFT_CLIENT_ID` / `SECRET` | Prod | OAuth Microsoft |
| `OWNER_OPEN_ID` | Prod | Primeiro admin |
| `EMAIL_FROM` + `RESEND_API_KEY` ou SMTP | Opcional | Emails |

> [!danger] Dev login em DB partilhado
> `devAuth` concede admin em todos os projetos quando aponta para DB remoto (ex. Cloud SQL). Usar só com DB local.

## Migrations em dev

| Situação | Comando |
|----------|---------|
| Schema mudou (criar SQL) | `pnpm db:push` ou `db:generate` + `db:migrate` |
| Só aplicar SQL existente | `pnpm db:migrate` |

Ver [[Comandos rápidos#Migrations]].

## Testes e qualidade

```bash
pnpm check    # TypeScript
pnpm test     # Vitest (19 testes, DB mockado)
pnpm format   # Prettier
pnpm build    # build de produção
```

## Estrutura relevante

Ver [[Arquitetura]] — pastas `client/`, `server/`, `drizzle/`, `shared/`.
