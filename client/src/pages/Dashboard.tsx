import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  Layers,
  LayoutDashboard,
  LogIn,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isTomorrow, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fmtBrl } from "@shared/billing";
import { BRAND, foregroundOn } from "@/lib/brand";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold mt-1.5 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-${priority}`}>{priority}</span>;
}

function DueDateLabel({ dueDate }: { dueDate: Date | null }) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const diff = differenceInDays(d, new Date());
  let label = format(d, "MMM d");
  let cls = "text-muted-foreground";
  if (isToday(d)) { label = "Today"; cls = "text-data-3-ink font-medium"; }
  else if (isTomorrow(d)) { label = "Tomorrow"; cls = "text-data-3-ink"; }
  else if (diff < 0) { label = `${Math.abs(diff)}d overdue`; cls = "text-destructive font-medium"; }
  else if (diff <= 3) cls = "text-data-3-ink";
  return (
    <span className={`flex items-center gap-1 text-xs ${cls}`}>
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: projects, isLoading: projectsLoading } = trpc.dashboard.recentProjects.useQuery();
  const { data: upcoming, isLoading: upcomingLoading } = trpc.dashboard.upcomingTasks.useQuery({ days: 14, limit: 50 });
  const { data: alerts } = trpc.dashboard.alerts.useQuery(undefined, { enabled: user?.role === "admin" });
  const { data: weeklyAccess, isLoading: weeklyAccessLoading } = trpc.dashboard.weeklyAccess.useQuery(
    { days: 7 },
    { enabled: user?.role === "admin" }
  );
  const { data: strategic } = trpc.dashboard.strategicOverview.useQuery(
    { limit: 10 },
    { enabled: user?.role === "admin" }
  );

  const now = new Date();
  const overdueTasks = (upcoming ?? []).filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const upcomingOnly = (upcoming ?? []).filter((t) => !t.dueDate || new Date(t.dueDate) >= now);

  const taskCounts = stats?.taskCounts as Record<string, number> | undefined;
  const totalTasks = Object.values(taskCounts ?? {}).reduce((a, b) => a + b, 0);
  const doneTasks = taskCounts?.done ?? 0;
  const inProgressTasks = taskCounts?.in_progress ?? 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here's what's happening across your projects today.
          </p>
        </div>
        <Button
          onClick={() => setLocation("/projects")}
          size="sm"
          variant="outline"
          className="gap-1.5"
        >
          <FolderKanban className="h-3.5 w-3.5" />
          View Projects
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              icon={FolderKanban}
              label="Total Projects"
              value={stats?.totalProjects ?? 0}
              sub="Active workspaces"
              color="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Layers}
              label="Total Tasks"
              value={totalTasks}
              sub={`${doneTasks} completed`}
              color="bg-data-6/15 text-data-6-ink"
            />
            <StatCard
              icon={Timer}
              label="In Progress"
              value={inProgressTasks}
              sub="Active tasks"
              color="bg-data-3/15 text-data-3-ink"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={doneTasks}
              sub={totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}% done` : "0% done"}
              color="bg-data-1/15 text-data-1-ink"
            />
          </>
        )}
      </div>

      {user?.role === "admin" && strategic && strategic.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Projetos estratégicos
            </h2>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setLocation("/projects")}>
              Abrir Projects <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {strategic.map((row) => (
              <Card
                key={row.id}
                className="border-0 shadow-sm shrink-0 w-80 cursor-pointer hover:shadow-md transition-all"
                onClick={() => setLocation(`/projects/${row.id}`)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{row.name}</p>
                    {row.isBlocked && (
                      <Badge variant="outline" className="text-[10px] border-data-3 text-data-3-ink shrink-0">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Bloq.
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Deadline: {row.nearestDeadline
                      ? `${row.nearestDeadline.title} · ${format(new Date(row.nearestDeadline.dueDate!), "dd/MM")}`
                      : "—"}
                  </p>
                  {row.finance && (
                    <div className="grid grid-cols-3 gap-1 text-[10px] pt-1 border-t">
                      <div>
                        <p className="text-muted-foreground">Receita</p>
                        <p className="font-medium">{fmtBrl(row.finance.projectedRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Recebido</p>
                        <p className="font-medium">{fmtBrl(row.finance.received)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Custo HH</p>
                        <p className="font-medium">{fmtBrl(row.finance.hhCost)}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {user?.role === "admin" && alerts && alerts.length > 0 && (
        <Card className="border-data-3/40 bg-data-3/10">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-data-3-ink mb-2">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} require attention</p>
            <div className="flex flex-wrap gap-2">
              {alerts.slice(0, 5).map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs border-data-3/60 text-data-3-ink">
                  {a.type.replace(/_/g, " ")}
                </Badge>
              ))}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setLocation("/calendar")}>View calendar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === "admin" && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Acessos da semana
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Dias em que cada usuário entrou na plataforma (últimos 7 dias)
              </p>
            </div>
            {weeklyAccess && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {format(parseISO(weeklyAccess.periodStart), "d MMM", { locale: ptBR })}
                {" – "}
                {format(parseISO(weeklyAccess.periodEnd), "d MMM", { locale: ptBR })}
              </p>
            )}
          </div>

          {weeklyAccessLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-5">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-7 w-12" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard
                  icon={Users}
                  label="Usuários ativos"
                  value={weeklyAccess?.uniqueUsers ?? 0}
                  sub="Com pelo menos 1 acesso"
                  color="bg-data-6/15 text-data-6-ink"
                />
                <StatCard
                  icon={LogIn}
                  label="Acessos (dias)"
                  value={weeklyAccess?.totalVisits ?? 0}
                  sub="Total de dias-usuário"
                  color="bg-data-5/15 text-data-5-ink"
                />
                <StatCard
                  icon={TrendingUp}
                  label="Média / usuário"
                  value={
                    weeklyAccess && weeklyAccess.uniqueUsers > 0
                      ? (weeklyAccess.totalVisits / weeklyAccess.uniqueUsers).toFixed(1)
                      : "0"
                  }
                  sub="Dias ativos na semana"
                  color="bg-data-1/15 text-data-1-ink"
                />
              </div>

              <Card className="border-0 shadow-sm">
                <CardContent className="p-0">
                  <div className="px-5 py-3 border-b border-border/60">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Por dia
                    </p>
                    <div className="mt-3 flex items-end gap-1.5 h-16">
                      {(weeklyAccess?.byDay ?? []).map((day) => {
                        const max = Math.max(1, ...(weeklyAccess?.byDay.map((d) => d.uniqueUsers) ?? [1]));
                        const height = `${Math.max(8, (day.uniqueUsers / max) * 100)}%`;
                        return (
                          <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                            <div className="w-full flex items-end justify-center h-12">
                              <div
                                className="w-full max-w-[28px] rounded-sm bg-signal"
                                style={{ height }}
                                title={`${day.uniqueUsers} usuário${day.uniqueUsers === 1 ? "" : "s"}`}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                              {format(parseISO(day.date), "EEE", { locale: ptBR })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="divide-y divide-border/60">
                    <div className="px-5 py-2.5 grid grid-cols-[1fr_auto_auto] gap-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Usuário</span>
                      <span className="text-right">Dias</span>
                      <span className="text-right w-20">Último</span>
                    </div>
                    {!weeklyAccess?.byUser.length ? (
                      <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                        Nenhum acesso registrado nesta semana ainda.
                      </div>
                    ) : (
                      weeklyAccess.byUser.map((u) => (
                        <div
                          key={u.userId}
                          className="px-5 py-3 grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.name ?? "Sem nome"}</p>
                            {u.email && (
                              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            )}
                          </div>
                          <span className="tabular-nums font-medium text-right">{u.visitDays}</span>
                          <span className="text-xs text-muted-foreground text-right w-20 tabular-nums">
                            {format(parseISO(u.lastVisit), "d MMM", { locale: ptBR })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/projects")}
            >
              Todos os projetos <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          {projectsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-3 w-64" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !projects?.length ? (
            <Card className="border-0 shadow-sm border-dashed border-2 border-border">
              <CardContent className="p-8 flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <FolderKanban className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">No projects yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your first project to get started
                  </p>
                </div>
                <Button size="sm" onClick={() => setLocation("/projects?create=1")}>
                  Create Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <Card
                  key={project.id}
                  className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                  onClick={() => setLocation(`/projects/${project.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-semibold"
                        style={{ background: project.color ?? BRAND.signal, color: foregroundOn(project.color ?? BRAND.signal) }}
                      >
                        {project.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                            {project.name}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] h-4 px-1.5 shrink-0 ${
                              project.status === "active"
                                ? "bg-data-1/15 text-data-1-ink border-transparent"
                                : project.status === "completed"
                                ? "bg-data-6/15 text-data-6-ink border-transparent"
                                : "bg-muted text-muted-foreground border-transparent"
                            }`}
                          >
                            {project.status}
                          </Badge>
                        </div>
                        {project.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Deadlines
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
              onClick={() => setLocation("/calendar")}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          {upcomingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-3">
                    <Skeleton className="h-3.5 w-full mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !overdueTasks.length && !upcomingOnly.length ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-data-1-ink" />
                <p className="text-sm font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground">No overdue or upcoming deadlines.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {overdueTasks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
                    Atrasados ({overdueTasks.length})
                  </p>
                  {overdueTasks.slice(0, 8).map((task) => (
                    <Card
                      key={task.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-200 border-l-2 border-l-destructive"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Circle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <DueDateLabel dueDate={task.dueDate} />
                              <PriorityBadge priority={task.priority} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {upcomingOnly.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Próximos ({upcomingOnly.length})
                  </p>
                  {upcomingOnly.slice(0, 8).map((task) => (
                    <Card
                      key={task.id}
                      className="border-0 shadow-sm hover:shadow-md transition-all duration-200"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          <Circle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <DueDateLabel dueDate={task.dueDate} />
                              <PriorityBadge priority={task.priority} />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/projects")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Manage Boards</p>
              <p className="text-xs text-muted-foreground">View all project boards</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/team")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-data-6/15 flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-data-6-ink" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Team Workload</p>
              <p className="text-xs text-muted-foreground">View member assignments</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/finance")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-data-3/15 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-data-3-ink" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Finance KPI</p>
              <p className="text-xs text-muted-foreground">Revenue & projections</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
