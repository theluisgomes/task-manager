---
tags:
  - task-manager
  - ui
  - ux
  - cursor-designer
created: 2026-06-23
---

# Princípios UX — Cursor Designer

Resumo actionable do [cursor-designer](https://github.com/spencergoldade/cursor-designer) para guiar melhorias no Task Manager Pro.

## O que é o cursor-designer

Template de **regras Cursor** focado em UX, UI, IA e acessibilidade — complementar a regras de código. Curado por Spencer Goldade.

### Perfis disponíveis

| Perfil | Ficheiros | Quando usar |
|--------|-----------|-------------|
| **Core** | `design-core.mdc`, `cursor-behavior-constraints.mdc` | Sempre — princípios mínimos |
| **Lean** (recomendado) | Core + 4 frontend rules | Apps web como Task Manager Pro |
| **Full** | Todos + binders | Audits, equipas maduras |

### Lean profile — ficheiros a copiar

```
.cursor/rules/core/design-core.mdc
.cursor/rules/core/cursor-behavior-constraints.mdc
.cursor/rules/frontend/ui-layout-and-density.mdc
.cursor/rules/frontend/ux-forms-and-validation.mdc
.cursor/rules/frontend/accessibility-frontend.mdc
.cursor/rules/frontend/ux-flows-and-feedback.mdc
```

Globs para este projecto: `["client/src/**/*.tsx"]`

## Always-on: Design Core

### UX Foundations
1. **Visibilidade do estado** — progresso, erros, resultados visíveis rapidamente.
   - *App:* skeletons ✓; falta loading global em mutações longas (upload attachment).
2. **Match com mundo real** — linguagem Kanban familiar (columns, tasks, assignee).
3. **Prevenção de erros** — confirmar delete project/board; disable submit se inválido.
4. **Progressive disclosure** — task dialog agrega detalhe; manter tabs/sections se crescer.

### UI Foundations
1. **Escala consistente** — spacing, typography, radii via tokens (ver [[UI/Design System - Recomendacao]]).
2. **Hierarquia visual** — primary vs secondary actions distintos.
3. **Responsividade** — layouts não quebram em 375px.

### Information Architecture
1. **Hierarquia rasa** — ≤ 3 níveis ✓
2. **Labels noun-based** — "Projects", "Team" ✓ (não "Manage your team")
3. **Navegação estável** — sidebar fixa ✓

### Sitemap Task Manager Pro

| Label | Rota | Notas |
|-------|------|-------|
| Dashboard | `/` | Overview |
| Projects | `/projects` | Lista + drill-down |
| Board | `/projects/:id/board/:id` | Breadcrumb: Projects / {name} / Board |
| Team | `/team` | Invites, roles |
| Finance KPI | `/finance` | Badge "Finance" na nav |
| Settings | `/settings` | Preferências |

**Melhoria:** Breadcrumbs explícitos no BoardView (cursor-designer: `Projects / Acme / Sprint Board`).

### Accessibility (WCAG 2.1 AA default)
- Keyboard accessible ✓ (parcial — Kanban gap)
- Focus visible ✓ (shadcn)
- Semantic structure — rever heading order por página

## Regras frontend — quando aplicar

| Tarefa | Rule file |
|--------|-----------|
| Spacing / layout | `ui-layout-and-density.mdc` |
| Formulários | `ux-forms-and-validation.mdc` + `accessibility-frontend.mdc` |
| Copy / mensagens | `ux-writing-and-microcopy.mdc` |
| Navegação / IA | `ia-navigation-and-structure.mdc` |
| Flows / feedback | `ux-flows-and-feedback.mdc` |
| Component states | `ui-components-and-states.mdc` |
| Visual language | `ui-visual-language.mdc` |

## Exemplo: form antes/depois (cursor-designer)

**Antes (weak):**
```html
<label>Email</label>
<input type="email" />
<button>Submit</button>
```

**Depois (guided):**
```html
<form aria-describedby="signup-help">
  <p id="signup-help">Create an account to save your work.</p>
  <label for="email">Work email</label>
  <input id="email" type="email" aria-invalid={hasError}
    aria-describedby={hasError ? "email-error" : undefined} />
  {hasError && <p id="email-error" role="alert">Use a valid email like name@company.com.</p>}
  <button type="submit">Create account</button>
</form>
```

**Aplicar em Task Manager Pro:**
- Create Project modal: `aria-describedby` no propósito do projecto
- Invite flow: mensagens de erro inline humanas
- Task form: validar title required com `role="alert"`

## Binders (deep dives opcionais)

| Binder | Quando invocar |
|--------|----------------|
| `design-quality-testing.mdc` | QA antes de release UI |
| `ux-research-usage.mdc` | Interpretar feedback utilizadores |
| `security-ux-patterns.mdc` | OAuth, invites, permissions |
| `cross-platform-ux-consistency.mdc` | Se app mobile nativa no futuro |

## Comportamento Cursor (constraints)

O cursor-designer instrui o AI a:
- **Não** sacrificar a11y por estética silenciosamente
- **Explicitar** trade-offs quando speed vs clarity
- **Usar** tokens existentes em vez de valores ad-hoc
- **Preferir** progressive disclosure

## Design docs template (copiar para `design/`)

### colors.md — roles semânticos
- `color-bg-surface`, `color-bg-subtle`
- `color-fg-default`, `color-fg-muted`
- `color-accent-primary`
- `color-border-subtle`, `color-border-critical`

### voice-and-tone
- Profissional mas approachable (B2B productivity)
- Acções: verbos imperativos ("Create project", "Move to Done")
- Erros: o que falhou + como corrigir (não só "Error 400")

## Integração com UI UX Pro Max

| cursor-designer | ui-ux-pro-max |
|-----------------|---------------|
| Processo e princípios | Paletas, estilos, reasoning por indústria |
| Regras Cursor `.mdc` | Skill + `search.py` CLI |
| design/ docs estáticos | Design system generator dinâmico |

**Workflow recomendado:**
1. Gerar direcção visual com uupm `search.py --design-system`
2. Documentar decisões em `design/` (cursor-designer)
3. Planear fases com ok-skills `planning-with-files` (ver [[UI/OK Skills - Catalogo e uso]])
4. Copiar lean rules para `.cursor/rules/`
5. Prototipar variantes com `huashu-design` (opcional, HTML)
6. QA com `agent-browser` nos breakpoints do checklist uupm

## Referências

- Repo: https://github.com/spencergoldade/cursor-designer
- Getting started: `GETTING_STARTED_FOR_DESIGNERS.md`
- Lean checklist: `LEAN_PROFILE_NOTES.md`
