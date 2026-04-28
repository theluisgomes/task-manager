# Task Manager Pro — TODO

## Phase 1: Foundation
- [x] Initialize project scaffold (web-db-user)
- [x] Create todo.md
- [x] Design system: color tokens, typography, spacing in index.css
- [x] Install dnd-kit for drag-and-drop

## Phase 2: Database Schema & Backend
- [x] Schema: projects, boards, columns, tasks, project_members, team_invites, kpi_entries, kpi_categories
- [x] Run migration and apply SQL
- [x] tRPC router: projects (CRUD)
- [x] tRPC router: boards (CRUD)
- [x] tRPC router: columns (CRUD, reorder)
- [x] tRPC router: tasks (CRUD, move between columns, reorder)
- [x] tRPC router: team (invite, list, workload)
- [x] tRPC router: kpi (CRUD entries, categories, projections)
- [x] tRPC router: dashboard (summary stats)

## Phase 3: Core UI Layout
- [x] DashboardLayout with elegant dark sidebar (logo, nav items, user profile)
- [x] Routing: /, /projects, /projects/:projectId/board/:boardId, /team, /finance, /settings
- [x] Design tokens applied: Inter font, OKLCH palette, indigo accent
- [x] ThemeProvider configured (light theme)
- [x] Sidebar collapse/expand micro-interaction

## Phase 4: Dashboard Overview
- [x] Stats cards: total projects, tasks by status, upcoming deadlines
- [x] Recent projects section
- [x] Quick-access shortcuts (Manage Boards, Team Workload, Finance KPI)
- [x] Empty state for new users

## Phase 5: Projects & Board Management
- [x] Projects list page with grid/list toggle
- [x] Create/edit/delete project modal with color picker
- [x] Board view with customizable columns
- [x] Add/rename/delete columns
- [x] Task cards: title, description, assignee avatar, due date, priority badge, status
- [x] Create/edit task modal with all fields
- [x] Empty state per column

## Phase 6: Drag-and-Drop
- [x] dnd-kit: drag tasks between columns
- [x] dnd-kit: reorder tasks within a column
- [x] Visual drag overlay (ghost card with rotation)
- [x] Smooth drop animation

## Phase 7: Team Management
- [x] Team members list page with stats
- [x] Invite member modal (by email/name)
- [x] Workload view: tasks per member with status breakdown
- [x] Empty state with invite CTA

## Phase 8: Finance KPI Calculator
- [x] KPI categories: Revenue, Budget, Variance, Profitability
- [x] Revenue projections: actuals + forecast + budget, line chart (Recharts)
- [x] Budget tracking: planned vs actual by category, bar chart (Recharts)
- [x] Variance analysis: calculated variance %, table with color coding
- [x] Profitability metrics: gross margin, net margin, pie chart + stacked bar (Recharts)
- [x] KPI entry form (add data points with period, actual, projected, budget)
- [x] Period selector (monthly/quarterly/annual)
- [x] Category management modal

## Phase 9: Polish & Tests
- [x] Micro-interactions: hover states, transitions, loading skeletons
- [x] Empty states: all pages have designed empty states
- [x] Priority badges: low/medium/high/urgent with color coding
- [x] Status badges: todo/in_progress/in_review/done
- [x] Toast notifications via Sonner
- [x] Error boundaries
- [x] Vitest: 23 backend router tests — all passing
- [x] Final review pass

## Future Enhancements
- [ ] Email notifications for task assignments
- [ ] File attachments on tasks
- [ ] Task comments / activity log
- [ ] Project timeline / Gantt view
- [ ] Export KPI data to CSV/Excel
- [ ] Dark mode toggle
- [ ] Mobile-responsive board view
