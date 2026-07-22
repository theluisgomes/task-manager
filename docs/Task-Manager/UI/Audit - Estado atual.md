---
tags:
  - task-manager
  - ui
  - audit
created: 2026-06-23
---

# Audit — Estado actual da UI

Análise do código em `client/src/` cruzada com princípios do [Cursor Designer](https://github.com/spencergoldade/cursor-designer) e guidelines do [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).

## Pontos fortes

### Design system base sólido
- **shadcn/ui** completo (~50 componentes) — botões, dialogs, forms, sidebar, charts.
- **Tokens CSS** em `index.css`: primary indigo (`oklch(0.46 0.18 264)`), radius 10px, sidebar escura em light mode.
- **Dark mode** funcional via `ThemeContext` + toggle na sidebar.
- **Lucide icons** em todo o lado — cumpre checklist "no emojis as icons".

### Interacções já polidas (parcialmente)
- `cursor-pointer` global em elementos clicáveis (`index.css` @layer base).
- Transições em cards: `hover:shadow-md`, `card-hover`, drag overlay com rotação/scale.
- Priority/status badges com classes semânticas (`.priority-*`, `.status-*`).
- Toasts Sonner para feedback de acções.

### Kanban (BoardView)
- dnd-kit com drag overlay, drop zones visuais (`.column-drop-active`, `.column-drop-done`).
- Task detail dialog com comments, attachments, assignee, due date.
- Inferência de status a partir do nome da coluna.

### Layout e IA
- Sidebar com 5 destinos claros: Dashboard, Projects, Team, Finance KPI, Settings.
- Labels **noun-based** e consistentes (alinhado com cursor-designer IA).
- Profundidade de navegação ≤ 3 níveis: Projects → Board → Task dialog.

## Gaps e oportunidades

### 1. Tipografia e densidade
| Actual | Guideline | Gap |
|--------|-----------|-----|
| Inter 14px body | 16px base (cursor-designer tokens) | Texto ligeiramente denso; labels `text-xs` abundantes |
| `font-weight: 600` headings | Escala heading-xl/m/body | Falta documentação de roles tipográficos |
| Plus Jakarta Sans sugerido (uupm) | Inter genérico SaaS | Identidade visual menos distintiva |

### 2. Dashboard — layout genérico
- Stat cards em grid uniforme — candidato a **Bento Grid** (cards de tamanhos variados).
- Sem secção "quick actions" destacada acima da dobra.
- Finance KPI linkado mas não integrado visualmente no overview.

### 3. Kanban mobile (crítico)
- Colunas em `flex-col md:flex-row` — em mobile empilha colunas verticalmente (scroll longo).
- **Anti-pattern** para productivity tools: falta swipe entre colunas ou vista tabbed.
- Drag-and-drop pointer-only — sem alternativa keyboard para mover tasks.

### 4. Acessibilidade
| Item | Estado | Severidade |
|------|--------|------------|
| Focus rings (shadcn) | ✓ nos primitives | — |
| Skip to main content | ✗ ausente | Média |
| `prefers-reduced-motion` | ✗ não implementado | Média |
| Kanban keyboard DnD | ✗ | Alta |
| Form error `src | Parcial (shadcn Form) | Média |
| Contraste dark mode primary | Usa `blue-700` vs oklch light | Baixa — verificar AA |

### 5. Formulários e microcopy
- Modais create project/task funcionais mas copy genérico ("Create", "Save").
- cursor-designer recomenda: labels action-based, erros inline humanos, `aria-describedby`.
- Invite page e login — OK estruturalmente; falta texto de contexto (`aria-describedby` no signup).

### 6. Visual language inconsistente
- Light: indigo oklch refinado.
- Dark: primary salta para Tailwind `blue-700` — **quebra coerência** entre modos.
- Dashboard cards `border-0 shadow-sm`; Projects cards podem diferir — unificar elevation.

### 7. Finance / data views
- Candidato a **Data-Dense Dashboard** style (uupm): KPI row, tabelas compactas, filtros sticky.
- Export CSV existe; UI de export pouco discoverable.

## Mapa de ficheiros relevantes

```
client/src/
├── index.css              ← tokens, badges, utilities
├── components/
│   └── DashboardLayout.tsx ← shell, nav, login, theme
├── pages/
│   ├── Dashboard.tsx      ← overview stats
│   ├── Projects.tsx       ← grid/list projects
│   ├── BoardView.tsx      ← kanban (981 linhas)
│   ├── Team.tsx
│   ├── Finance.tsx
│   └── Settings.tsx
└── components/ui/           ← shadcn primitives
```

## Scorecard rápido (1–5)

| Dimensão | Score | Notas |
|----------|-------|-------|
| Consistência visual | 4 | shadcn ajuda; dark/light primary diverge |
| Hierarquia | 3 | Dashboard flat; falta destaque a acções primárias |
| Responsividade | 2 | Kanban mobile fraco |
| Acessibilidade | 3 | Primitives OK; app-level gaps |
| Feedback / estados | 4 | Toasts, skeletons, drag states |
| IA / navegação | 4 | Clara e previsível |
| Performance perceived | 4 | Skeletons; animações leves |

## Conclusão

A app tem **fundações enterprise sólidas** (shadcn, tokens, sidebar). O maior ROI de UX está em:

1. **Kanban mobile** dedicado
2. **Dashboard Bento** com hierarquia clara
3. **A11y** (skip link, reduced motion, keyboard kanban)
4. **Unificar tokens** dark/light e documentar escala tipográfica

Ver plano detalhado em [[UI/Plano de melhorias UI]].
