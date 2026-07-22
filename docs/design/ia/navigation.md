# Navigation & IA — Task Manager Pro

## Sitemap

| Label | Route |
|-------|-------|
| Dashboard | `/` |
| Projects | `/projects` |
| Board | `/projects/:projectId/board/:boardId` |
| Team | `/team` |
| Finance KPI | `/finance` |
| Settings | `/settings` |
| Invite | `/invite/:token` |

## Guidelines

- Noun-based labels in present tense
- Max depth: 3 levels (Projects → Board → Task dialog)
- Breadcrumbs on BoardView: `Projects / {project} / {board}`
