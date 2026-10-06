import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  AlertCircle,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  FolderKanban,
  LogIn,
  Minus,
  TrendingUp,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addDays, eachDayOfInterval, format, isToday, isTomorrow, differenceInDays, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fmtBrl } from "@shared/billing";
import { DEFAULT_DAILY_TARGET, formatHoursLabel } from "@shared/hoursCapacity";
import { BRAND, foregroundOn } from "@/lib/brand";
import { toast } from "sonner";

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

const PRIORITY_LABEL: Record<string, string> = {
  low: "baixa",
  medium: "média",
  high: "alta",
  urgent: "urgente",
};

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-${priority}`}>{PRIORITY_LABEL[priority] ?? priority}</span>;
}

function DueDateLabel({ dueDate }: { dueDate: Date | null }) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const diff = differenceInDays(d, new Date());
  let label = format(d, "d MMM", { locale: ptBR });
  let cls = "text-muted-foreground";
  if (isToday(d)) { label = "Hoje"; cls = "text-data-3-ink font-medium"; }
  else if (isTomorrow(d)) { label = "Amanhã"; cls = "text-data-3-ink"; }
  else if (diff < 0) { label = `${Math.abs(diff)}d atrasado`; cls = "text-destructive font-medium"; }
  else if (diff <= 3) cls = "text-data-3-ink";
  return (
    <span className={`flex items-center gap-1 text-xs ${cls}`}>
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

function formatHours(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
}

function DeadlineItem({
  task,
  done,
  overdue,
  pending,
  onToggle,
}: {
  task: { id: number; title: string; dueDate: Date | null; priority: string };
  done: boolean;
  overdue: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className={`border-0 py-0 gap-0 shadow-none ${overdue && !done ? "border-l-2 border-l-destructive" : ""}`}>
      <CardContent className="px-2 py-1">
        <div className="flex items-center gap-2 min-h-7">
          <button
            type="button"
            aria-pressed={done}
            aria-label={done ? "Desmarcar como realizado" : "Marcar como realizado"}
            disabled={pending}
            className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={onToggle}
          >
            {done
              ? <CheckCircle2 className="h-3.5 w-3.5 text-data-1-ink" />
              : <Circle className={`h-3.5 w-3.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />}
          </button>
          <p className={`text-xs font-medium truncate flex-1 ${done ? "line-through text-muted-foreground" : ""}`}>{task.title}</p>
          <DueDateLabel dueDate={task.dueDate} />
          <PriorityBadge priority={task.priority} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const canSeeMoney = Boolean(user?.canSeeMoney);
  const [, setLocation] = useLocation();
  const weekDays = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 4),
  });
  const weekStart = format(weekDays[0], "yyyy-MM-dd");
  const weekEnd = format(weekDays[4], "yyyy-MM-dd");
  const { data: finance, isLoading: financeLoading } = trpc.finance.summary.useQuery(undefined, {
    enabled: canSeeMoney,
  });
  const { data: weekSheet, isLoading: hoursLoading } = trpc.timesheets.myWeek.useQuery({ weekStart, weekEnd });
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

  const [listsExpanded, setListsExpanded] = useState(false);
  const utils = trpc.useUtils();
  const setTaskDone = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.dashboard.upcomingTasks.invalidate(); },
    onError: (err) => toast.error(err.message || "Não foi possível atualizar a tarefa"),
  });

  const now = new Date();
  const openTasks = (upcoming ?? []).filter((t) => t.status !== "done");
  const doneTasks = (upcoming ?? []).filter((t) => t.status === "done");
  const overdueTasks = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const upcomingOnly = openTasks.filter((t) => !t.dueDate || new Date(t.dueDate) >= now);

  const financeProjects = finance?.projects ?? [];
  const hoursLogged = financeProjects.reduce((sum, project) => sum + (project.totalHours ?? 0), 0);
  const totals = finance?.totals;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 17) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.name?.split(" ")[0] ?? "olá"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canSeeMoney
              ? "Receita, custo, lucro e horas dos seus projetos."
              : "Horas da semana, capacidade e prazos dos seus projetos."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocation("/hours")}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <Clock className="h-3.5 w-3.5" />
            Lançar horas
          </Button>
          <Button
            onClick={() => setLocation("/projects")}
            size="sm"
            variant="outline"
            className="gap-1.5"
          >
            <FolderKanban className="h-3.5 w-3.5" />
            Ver projetos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {canSeeMoney ? (
          financeLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-12" />
                </CardContent>
              </Card>
            ))
          ) : !financeProjects.length || !totals ? (
            <Card className="border-0 shadow-sm col-span-2 lg:col-span-4">
              <CardContent className="p-6 text-sm text-muted-foreground">
                Nenhum projeto sob a sua gestão. O resumo mostra contratos e horas dos projetos em que você é owner ou admin.
              </CardContent>
            </Card>
          ) : (
            <>
              <StatCard
                icon={DollarSign}
                label="Receita real"
                value={fmtBrl(totals.actualRevenue)}
                sub="Parcelas recebidas"
                color="bg-data-6/15 text-data-6-ink"
              />
              <StatCard
                icon={Minus}
                label="Custo real"
                value={fmtBrl(totals.actualCost)}
                sub="Horas e ajustes do contrato"
                color="bg-data-4/15 text-data-4-ink"
              />
              <StatCard
                icon={TrendingUp}
                label="Lucro real"
                value={fmtBrl(totals.actualProfit)}
                sub="Receita menos custo"
                color="bg-data-1/15 text-data-1-ink"
              />
              <StatCard
                icon={Clock}
                label="Horas lançadas"
                value={formatHours(hoursLogged)}
                sub="Nos projetos do resumo"
                color="bg-primary/10 text-primary"
              />
            </>
          )
        ) : hoursLoading ? (
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
              icon={Clock}
              label="Esta semana"
              value={`${formatHoursLabel(weekSheet?.workedThisWeek ?? 0)} / ${formatHoursLabel((weekSheet?.dailyTarget ?? DEFAULT_DAILY_TARGET) * 5)}`}
              sub="Meta de segunda a sexta"
              color="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Clock}
              label="Este mês"
              value={
                weekSheet?.monthlyCapacity
                  ? `${formatHoursLabel(weekSheet.workedThisMonth)} / ${formatHoursLabel(weekSheet.monthlyCapacity)}`
                  : formatHoursLabel(weekSheet?.workedThisMonth ?? 0)
              }
              sub="Capacidade do contrato"
              color="bg-data-6/15 text-data-6-ink"
            />
            <StatCard
              icon={FolderKanban}
              label="Alocações"
              value={String((weekSheet?.projects ?? []).filter((project) => project.allocatedHours != null).length)}
              sub={`${(weekSheet?.projects ?? []).filter((project) => project.overAllocated).length} acima do previsto`}
              color="bg-data-3/15 text-data-3-ink"
            />
            <StatCard
              icon={Clock}
              label="Meta diária"
              value={formatHoursLabel(weekSheet?.dailyTarget ?? DEFAULT_DAILY_TARGET)}
              sub="Abrir grelha de horas"
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
              Abrir projetos <ArrowRight className="h-3 w-3" />
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
                    Prazo: {row.nearestDeadline
                      ? `${row.nearestDeadline.title} · ${format(new Date(row.nearestDeadline.dueDate!), "dd/MM")}`
                      : "—"}
                  </p>
                  {canSeeMoney && row.finance && (
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
            <p className="text-sm font-medium text-data-3-ink mb-2">{alerts.length} {alerts.length === 1 ? "alerta pede atenção" : "alertas pedem atenção"}</p>
            <div className="flex flex-wrap gap-2">
              {alerts.slice(0, 5).map((a, i) => (
                <Badge key={i} variant="outline" className="text-xs border-data-3/60 text-data-3-ink">
                  {a.type.replace(/_/g, " ")}
                </Badge>
              ))}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setLocation("/calendar")}>Ver calendário</Button>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Prazos
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-2"
                onClick={() => setListsExpanded((open) => !open)}
              >
                {listsExpanded ? "Recolher" : "Expandir"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                onClick={() => setLocation("/calendar")}
              >
                Ver todos <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
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
          ) : (
            <div className={`space-y-1 pr-1 ${listsExpanded ? "" : "h-80 overflow-y-auto"}`}>
              {!overdueTasks.length && !upcomingOnly.length && (
                <Card className="border-0 shadow-sm">
                  <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                    <CheckCircle2 className="h-8 w-8 text-data-1-ink" />
                    <p className="text-sm font-medium">Em dia</p>
                    <p className="text-xs text-muted-foreground">Nenhum prazo atrasado ou próximo.</p>
                  </CardContent>
                </Card>
              )}
              {overdueTasks.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive sticky top-0 bg-background py-0.5">
                    Atrasados ({overdueTasks.length})
                  </p>
                  {overdueTasks.map((task) => (
                    <DeadlineItem
                      key={task.id}
                      task={task}
                      done={false}
                      overdue
                      pending={setTaskDone.isPending && setTaskDone.variables?.id === task.id}
                      onToggle={() => setTaskDone.mutate({ id: task.id, status: "done" })}
                    />
                  ))}
                </div>
              )}
              {upcomingOnly.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-background py-0.5">
                    Próximos ({upcomingOnly.length})
                  </p>
                  {upcomingOnly.map((task) => (
                    <DeadlineItem
                      key={task.id}
                      task={task}
                      done={false}
                      overdue={false}
                      pending={setTaskDone.isPending && setTaskDone.variables?.id === task.id}
                      onToggle={() => setTaskDone.mutate({ id: task.id, status: "done" })}
                    />
                  ))}
                </div>
              )}
              {doneTasks.length > 0 && (
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-background py-0.5">
                    Realizados ({doneTasks.length})
                  </p>
                  {doneTasks.map((task) => (
                    <DeadlineItem
                      key={task.id}
                      task={task}
                      done
                      overdue={false}
                      pending={setTaskDone.isPending && setTaskDone.variables?.id === task.id}
                      onToggle={() => setTaskDone.mutate({ id: task.id, status: "todo" })}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Últimos projetos
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
              onClick={() => setLocation("/projects")}
            >
              Ver <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
          {projectsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : !projects?.length ? (
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-border px-3 py-4 text-left text-xs text-muted-foreground hover:bg-muted/40"
              onClick={() => setLocation("/projects?create=1")}
            >
              Nenhum projeto ainda. Criar o primeiro.
            </button>
          ) : (
            <div className={`space-y-0.5 pr-1 ${listsExpanded ? "" : "h-80 overflow-y-auto"}`}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="w-full flex items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-muted/60"
                  onClick={() => setLocation(`/projects/${project.id}`)}
                >
                  <span
                    className="h-5 w-5 rounded flex items-center justify-center shrink-0 text-[10px] font-semibold"
                    style={{ background: project.color ?? BRAND.signal, color: foregroundOn(project.color ?? BRAND.signal) }}
                  >
                    {project.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 text-xs font-medium truncate">{project.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
