# Relatório — Task Manager Modo Completo

Fonte: `Task Manager_Modo Completo.pdf`  
Data: 2026-07-22  
Decisões: CRM = página `/crm`; vista estratégica = board canônico (sem flatten no DB).

## Checklist por requisito

| Spec | Requisito PDF | Status | Evidência |
|------|---------------|--------|-----------|
| SPEC-01 | Projetos por área +/− e mudar área | Done | Já existia; QA mantido |
| SPEC-02 | Dependências ao criar task | Done | Modal permanece em edit após create; `TaskExtras` disponível |
| SPEC-03 | Cards com pontas inacessíveis | Done | Scroll nas colunas + `line-clamp-2` no título |
| SPEC-04 | Horas trabalhadas no projeto | Done | Timesheets já existiam |
| SPEC-05 | Calendário entregas/faturamento (admin) | Done | Valores de pagamento restritos a admin; calendário existente |
| SPEC-06 | Multi-assignee | Done | Tabela `task_assignees`, API `assigneeIds`, UI multi-select |
| SPEC-07 | Vista estratégica (até 10 ativos, prioridade) | Done | `strategicPriority` + `projects.strategicOverview` + toggle em Projects |
| SPEC-08 | Dashboard deadlines + View all | Done | Inclui overdue, exclui done; View all → `/calendar` |
| SPEC-09 | Dashboard horizontal + métricas financeiras | Done | Faixa estratégica admin com receita/recebido/custo HH |
| SPEC-10 | Teams: horas, contrato, custo HH | Done | `user_employment_contracts` + UI admin em Team |
| SPEC-11 | Finance por contrato (orçado vs real) | Done | Tab Contratos P&L (`finance.contractPl`) |
| SPEC-12 | Painel NF/D+X/checkbox quitado | Done | Já existia no Faturamento do projeto |
| SPEC-13 | E-mail vencimentos → Rodrigo | Done | `POST /api/cron/payment-reminders` + botão admin + log idempotente |
| SPEC-14 | Seção CRM | Done | Página `/crm` com pipeline de leads |

## Migrations

- `drizzle/0009_modo_completo.sql` — strategicPriority, task_assignees, user_employment_contracts, payment_reminder_log

## Env novos

- `PAYMENT_REMINDER_EMAIL` (default `rodrigo@wisemetrics.in`)
- `CRON_SECRET` (Bearer / x-cron-secret para o endpoint cron)

## Como validar

1. `pnpm run db:migrate` (aplica 0009)
2. Criar projeto → board canônico criado automaticamente
3. Projects → vista estratégica (ícone layout)
4. Board → criar task → deps/comentários aparecem sem sair
5. Task → múltiplos assignees
6. Dashboard admin → deadlines atrasados + faixa estratégica
7. Team (admin) → contratos / alocações / custo HH
8. Finance → Contratos P&L + enviar lembretes
9. `/crm` → pipeline de leads
10. Agendar Cloud Scheduler: `POST /api/cron/payment-reminders` com `Authorization: Bearer $CRON_SECRET`
