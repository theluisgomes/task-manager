# Progress — UI Visual Upgrade

## 2026-06-23 — Fase 1 (prior)
- Tokens dark/light, skip link, reduced motion, breadcrumbs

## 2026-06-23 — Fases 2–4

### Foundation
- `client/src/index.css` — Plus Jakarta Sans, 16px body, `.bento-card`, dark badges, `--shadow-soft`
- `design/tokens/colors.md`, `typography.md`, `spacing.md`, `design/ia/navigation.md` (em `docs/design/`)

### Dashboard
- `client/src/pages/Dashboard.tsx` — Bento grid, workload, finance snapshot
- `client/src/components/dashboard/DashboardHero.tsx`, `StatBentoCard.tsx`
- Projects `?create=1` opens create modal

### Kanban
- `client/src/pages/BoardView.tsx` — mobile tabs + snap scroll, Move to column, Empty states, task title `text-sm`

### Finance
- `client/src/pages/Finance.tsx` — compact KPI cards, sticky table headers, larger export button

### Forms & shell
- `Projects.tsx` — CreateProjectModal a11y
- `BoardView.tsx` — TaskModal a11y
- `Invite.tsx`, `Settings.tsx`, `DashboardLayout.tsx` — aria improvements

## Verification
- [x] `pnpm exec tsc --noEmit`
- [x] `pnpm run build`
