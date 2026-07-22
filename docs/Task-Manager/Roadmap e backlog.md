---
tags:
  - task-manager
  - roadmap
  - backlog
aliases:
  - TODO
  - Features
created: 2026-06-23
---

# Roadmap e backlog

Espelho do `docs/TODO.md` do repo, com contexto para decisões futuras.

## Concluído (v1)

### Produto
- [x] Kanban com drag-and-drop (dnd-kit)
- [x] Projetos, boards, colunas, tasks
- [x] Equipa: invites, workload, roles (owner/admin/member)
- [x] Comments e activity log
- [x] Attachments em tasks
- [x] Email: assignments, @mentions, invite accepted
- [x] Finance KPI + export CSV
- [x] Dark mode
- [x] OAuth Google + Microsoft

### Operações e tooling
- [x] `pnpm run doctor` — suite de diagnóstico
- [x] `pnpm run maintenance` — rotina semanal
- [x] `/health` com ping MySQL
- [x] `db:generate` / `db:migrate` separados
- [x] CI: migrate + smoke test real
- [x] Docs: `docs/MAINTENANCE.md` + este cofre Obsidian

## Pendente — produto (Fase C)

| Item | Estado | Notas |
|------|--------|-------|
| Gantt / timeline | Não iniciado | Feature nova, maior escopo |
| Export Excel | Parcial | CSV existe; `xlsx` no package.json mas não usado |
| Board mobile | Parcial | `flex-col md:flex-row` — falta UX dedicada |
| CRM schema | Adiado | `drizzle/schema.crm.ts` — decidir: implementar, arquivar ou remover |

## Pendente — técnico (Fase B)

| Item | Prioridade | Descrição |
|------|------------|-----------|
| Log falhas de email | Média | Assignments ignoram resultado de `sendEmail` |
| Script órfãos `--fix` | Baixa | Limpeza com confirmação manual |
| Remover código morto | Baixa | `_core/llm`, `imageGeneration`, `dataApi`, `map` |
| ESLint | Baixa | Só Prettier + tsc hoje |

## Decisões em aberto

### `schema.crm.ts`
- **Implementar** — se CRM faz parte do roadmap
- **Arquivar** — mover para branch separada
- **Remover** — se não há plano de uso

### Board mobile
- Opção A: melhorar layout responsivo existente
- Opção B: vista mobile dedicada (swipe entre colunas) — **recomendada** em [[UI/Plano de melhorias UI]] Fase 3
- Plano UX completo: [[UI e UX - Hub]]

### Export Excel
- Reutilizar `xlsx` já instalado
- Endpoint `kpi.exportExcel` espelhando `kpi.exportCsv`

## Como actualizar

Após concluir algo na semana:
1. Marcar aqui e em `docs/TODO.md`
2. Mencionar no relatório de [[Manutenção semanal]]
