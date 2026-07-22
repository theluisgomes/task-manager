---
tags:
  - task-manager
  - ui
  - design-system
created: 2026-06-23
---

# Design System — Recomendação

Direcção visual para Task Manager Pro, gerada com o motor de reasoning do [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) e refinada com templates do [Cursor Designer](https://github.com/spencergoldade/cursor-designer).

> [!note] Nota sobre paletas auto-geradas
> O comando `search.py "task manager kanban"` sugeriu vermelho (#DC2626) — **rejeitado** por conflito com marca indigo existente e conotação "erro/urgência". Mantemos indigo como primary; aplicamos estilos e padrões, não a paleta automática.

## Estilo principal: Soft UI Evolution

| Propriedade | Valor |
|-------------|-------|
| Keywords | Subtle depth, improved contrast, 200–300ms transitions, WCAG AA+ |
| Best for | Modern enterprise SaaS, productivity tools |
| Framework fit | Tailwind 9/10, shadcn 10/10 |
| Complexidade | Média |

**Porquê:** Evolução natural do visual actual (shadow-sm, rounded-xl, hover states) sem saltar para neumorphism (baixo contraste) nem flat puro.

### Efeitos chave
```css
/* Alinhado com uupm Soft UI Evolution */
--shadow-soft: 0 1px 3px oklch(0 0 0 / 0.06), 0 4px 12px oklch(0 0 0 / 0.04);
--animation-duration: 200ms;
--border-radius: 10px; /* ≈ actual --radius: 0.625rem */
```

- Sombras multi-camada suaves (não flat, não neumorphic)
- Hover: `shadow-md` + optional `scale(1.01)` em cards clicáveis
- Focus: ring 3px (já presente nos shadcn components)

## Estilos por ecrã (híbrido)

| Ecrã | Estilo uupm | Aplicação |
|------|-------------|-----------|
| Dashboard | **Bento Box Grid** | Cards assimétricos 1×1, 2×1, 2×2; fundo `#F5F5F7` / dark equivalent |
| Kanban | **Micro-interactions** | Drag feedback, column highlight, 150ms transitions, haptic-like visual cues |
| Finance | **Data-Dense Dashboard** | KPI row compacta, tabelas 12–14px, grid 12 colunas, padding 8–12px |
| Login | **Minimal & Direct** | Centrado, single column above fold, OAuth buttons |

## Paleta de cores (evolução, não revolução)

### Semantic roles (cursor-designer pattern)

| Token | Light (actual → target) | Dark (target) |
|-------|-------------------------|---------------|
| `--background` | oklch(0.99…) ✓ | oklch(0.141…) ✓ |
| `--primary` | indigo oklch(0.46 0.18 264) ✓ | **Fix:** oklch indigo matching light, não `blue-700` |
| `--foreground` | oklch(0.13…) ✓ | oklch(0.85…) ✓ |
| `--accent` | indigo tint ✓ | sidebar-accent aligned |
| `--destructive` | red oklch ✓ | manter |
| Success (KPI) | `#22C55E` | green-400 dark |

### Cores funcionais Kanban
Manter badges actuais; garantir contraste AA em dark mode:
- `priority-urgent`: verificar 4.5:1 em `.dark`
- Column colors: user-picked hex com fallback contrast checker

## Tipografia

### Recomendação uupm: Plus Jakarta Sans
- Mood: friendly, modern, SaaS, productivity
- Google Fonts: `family=Plus+Jakarta+Sans:wght@300;400;500;600;700`

### Escala (cursor-designer tokens adaptados)

| Role | Size | Weight | Uso |
|------|------|--------|-----|
| `heading-xl` | 28–32px | 600 | Título de página (1× por ecrã) |
| `heading-m` | 20–24px | 600 | Secções |
| `body` | **16px** | 400 | Conteúdo principal (↑ de 14px actual) |
| `body-small` | 14px | 400 | Metadata, captions |
| `caption` | 12px | 500 | Labels uppercase stats |

**Decisão em aberto:** Migrar Inter → Plus Jakarta Sans (requer teste de densidade no Kanban).

## Spacing scale

Adoptar escala cursor-designer (mapear para Tailwind):

| Token | px | Tailwind |
|-------|-----|----------|
| spacing-1 | 4 | `1` |
| spacing-2 | 8 | `2` |
| spacing-3 | 12 | `3` |
| spacing-4 | 16 | `4` |
| spacing-5 | 24 | `6` |
| spacing-6 | 32 | `8` |
| spacing-7 | 40 | `10` |
| spacing-8 | 56 | `14` |

**Regras:**
- Label → input: `spacing-2` (8px)
- Entre campos form: `spacing-4`
- Entre secções página: `spacing-6`–`spacing-7`
- Page gutter: `spacing-4` mobile, `spacing-8` desktop (container actual ✓)

## Bento Dashboard — wireframe conceptual

```
┌─────────────────────────────────────────────────────────┐
│  Good morning, {user}          [+ New Project] [Board]  │
├──────────────────────┬──────────────────────────────────┤
│  Active Tasks (2×1)  │  Overdue (1×1) │ Due Today (1×1)│
├──────────────────────┴────────────────┴────────────────┤
│  Recent Projects (2×2)     │  Team Workload (2×1)       │
├────────────────────────────┼────────────────────────────┤
│  Finance snapshot (2×1)    │  Activity feed (2×1)       │
└────────────────────────────┴────────────────────────────┘
```

CSS Grid: `grid-template-columns: repeat(4, 1fr); gap: 16px;`  
Responsive: 4 → 2 → 1 colunas (375 / 768 / 1024 / 1440).

## Kanban — padrões UX

| Padrão | Implementação |
|--------|---------------|
| Drag affordance | Grip handle visible; `cursor-grab` / `cursor-grabbing` |
| Drop feedback | Manter `.column-drop-active` / `.column-drop-done` |
| Mobile | Tab bar colunas OU horizontal snap scroll 1 coluna visível |
| Empty states | Componente `Empty` shadcn com CTA "Add task" |
| Keyboard | dnd-kit KeyboardSensor + menu "Move to…" fallback |

## Pre-delivery checklist (uupm)

- [x] Lucide SVG icons (não emojis)
- [x] cursor-pointer em clickables
- [ ] Hover 150–300ms em todos os interactivos
- [ ] Contraste 4.5:1 light mode (auditar badges)
- [x] Focus states (shadcn)
- [ ] `prefers-reduced-motion`
- [ ] Responsive 375 / 768 / 1024 / 1440

## Anti-patterns a evitar

| Anti-pattern | Razão |
|--------------|-------|
| AI purple/pink gradients | Cliché; conflita com indigo brand |
| Neumorphism puro | Baixo contraste WCAG |
| Complex onboarding | App é para equipas que já usam Kanban |
| Slow animations >400ms | Productivity tool — snappy wins |
| Red primary (auto-gen uupm) | Confunde com destructive |

## Ficheiros de design sugeridos no repo

Espelhar estrutura cursor-designer (opcional, para Cursor rules):

```
design/
├── tokens/
│   ├── colors.md      ← esta paleta
│   ├── typography.md  ← escala acima
│   └── spacing.md
├── ia/
│   └── navigation.md  ← sitemap actual
└── content/
    └── voice-and-tone.md
```

## Comando para regenerar / explorar

```bash
# Clonar skill (ou: npx uipro-cli init --ai cursor)
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py \
  "SaaS dashboard productivity" --design-system -f markdown -p "Task Manager Pro"

python3 .../search.py "Bento Grid dashboard" --domain style
python3 .../search.py "accessibility keyboard focus" --domain ux
python3 .../search.py "form validation" --stack react
```

## Integração ok-skills

Para execução e QA, ver [[UI/OK Skills - Catalogo e uso]]:
- **planning-with-files** — uma fase = notas em `docs/archive/ui-upgrade/` ou no cofre Obsidian
- **huashu-design** — protótipo Bento antes de alterar `Dashboard.tsx`
- **agent-browser** — regressão visual pós-implementação

