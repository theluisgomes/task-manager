---
tags:
  - task-manager
  - troubleshooting
  - suporte
aliases:
  - FAQ
  - Problemas
created: 2026-06-23
---

# Troubleshooting

## Manutenção e doctor

### `pnpm doctor` não funciona

**Causa:** conflito com comando interno do pnpm.

**Solução:**
```bash
pnpm run doctor
```

### `db.local.ping` FAIL

**Causa:** MySQL não está a correr.

**Solução:**
```bash
docker compose up -d db
# ou
pnpm dev:up
```

Verificar `DATABASE_URL` no `.env`.

### `--prod` falha no Cloud SQL proxy

**Causa:** `deploy.env` em falta, gcloud não autenticado, ou proxy não descarregado.

**Solução:**
1. Copiar e preencher `scripts/deploy.env`
2. `gcloud auth login`
3. `./scripts/deploy-gcp.sh migrate` (baixa proxy para `.cache/`)

### Relatórios não aparecem no git

**Esperado.** `reports/*.md` está no `.gitignore`. Artefactos locais apenas.

---

## Desenvolvimento local

### Porta 3000 ocupada

```bash
lsof -i :3000
# ou definir PORT no .env
```

### Dev login dá admin em tudo

**Causa:** `devAuth` + `ensureUserAccessToAllProjects` com DB remoto.

**Solução:** usar só DB local em desenvolvimento.

### OAuth redirect mismatch

Redirect URI deve ser exactamente:
```
{OAUTH_REDIRECT_BASE_URL}/api/auth/callback
```

---

## Deploy e produção

### `/health` retorna 503

**Causa:** Cloud SQL inacessível ou `DATABASE_URL` incorrecto.

**Verificar:**
- Instância Cloud SQL activa
- Secret `db-url-secret` no Secret Manager
- Cloud Run tem `--add-cloudsql-instances`

### Migrations falham em produção

**Não usar** `pnpm db:push`.

```bash
./scripts/deploy-gcp.sh migrate
```

Se DB ficou a meio por migration antiga `0003`, ver secção de migrations em `docs/DEPLOY.md`.

### Login não funciona em produção

- Dev login **não** funciona com `NODE_ENV=production`
- Confirmar `GOOGLE_CLIENT_ID` + secret no Cloud Run
- Redirect URI no Google Console = URL pública + `/api/auth/callback`

---

## Base de dados

### Integridade: órfãos detectados

Reportados como **WARN** pelo [[Doctor - Diagnóstico]]. Não há auto-fix.

| Tipo | Acção sugerida |
|------|----------------|
| Tasks sem coluna | Apagar ou reassign manualmente |
| Members sem user | Limpar `project_members` órfãos |
| Invites expirados | Actualizar `status` para `expired` |
| Attachments em falta | Remover registo ou restaurar ficheiro |

### Migrations pendentes em localhost

```bash
pnpm db:migrate
```

A [[Manutenção semanal]] aplica automaticamente se `DATABASE_URL` for localhost.

---

## Dependências

### `pnpm audit` WARN

Rever advisories. Não fazer `pnpm update` automático na rotina semanal — planear upgrade manual.

### `pnpm outdated` com major versions

Agendar sessão separada com `pnpm update --interactive` e testes completos.

---

## Links úteis

- [[Manutenção semanal]]
- [[Doctor - Diagnóstico]]
- [[Deploy GCP]]
- [[Desenvolvimento local]]
- `docs/DEPLOY.md` no repo
