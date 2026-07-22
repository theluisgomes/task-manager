# Findings — UI Fase 1

## Baseline (pre-change)
- Dark mode used `var(--color-blue-700)` while light used indigo oklch — visual brand break.
- No skip link; keyboard users tab through entire sidebar before main content.
- No `prefers-reduced-motion` — card-hover and drag-overlay always animate.
- BoardView had manual `/` breadcrumb buttons, not semantic `<nav aria-label="breadcrumb">`.

## Implementation notes
- ok-skills cloned to `~/.agents/skills/ok-skills`.
- Dark primary: `oklch(0.65 0.18 264)` — same hue 264 as light, higher lightness for dark surfaces.
- Skip link uses Tailwind `sr-only` + `focus:not-sr-only` pattern.
- `main#main-content` has `tabIndex={-1}` so skip link focus moves into landmark.
