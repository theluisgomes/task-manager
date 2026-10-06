import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { addDays, addWeeks, eachDayOfInterval, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DEFAULT_DAILY_TARGET, formatHoursLabel } from "@shared/hoursCapacity";

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function CapacityMeter({
  worked,
  allocated,
  over,
}: {
  worked: number;
  allocated: number | null;
  over: boolean;
}) {
  if (allocated == null) {
    return (
      <p className="text-[11px] text-muted-foreground mt-1">
        {formatHoursLabel(worked)} no mês · sem alocação
      </p>
    );
  }
  const ratio = allocated > 0 ? Math.min(worked / allocated, 1) : 0;
  return (
    <div className="mt-1.5 space-y-1 max-w-[11rem]">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className={over ? "text-destructive font-medium" : "text-muted-foreground"}>
          {formatHoursLabel(worked)} / {formatHoursLabel(allocated)}
        </span>
        {over && (
          <span className="inline-flex items-center gap-0.5 text-destructive">
            <AlertTriangle className="h-3 w-3" />
            acima
          </span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function HoursPage() {
  const [weekAnchor, setWeekAnchor] = useState(new Date());
  const [draft, setDraft] = useState<Record<string, string>>({});
  const days = useMemo(() => {
    const start = startOfWeek(weekAnchor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end: addDays(start, 4) });
  }, [weekAnchor]);
  const weekStart = isoDate(days[0]);
  const weekEnd = isoDate(days[4]);

  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.timesheets.myWeek.useQuery({ weekStart, weekEnd });
  const upsert = trpc.timesheets.upsert.useMutation({
    onSuccess: () => {
      utils.timesheets.myWeek.invalidate({ weekStart, weekEnd });
      utils.projects.hoursSummary.invalidate();
      utils.timesheets.listByProject.invalidate();
      utils.finance.summary.invalidate();
      utils.finance.teamUtilization.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cells = data?.cells ?? {};
  const projects = data?.projects ?? [];
  const dailyTarget = data?.dailyTarget ?? DEFAULT_DAILY_TARGET;
  const weekTarget = roundHours(dailyTarget * days.length);

  const saveCell = (projectId: number, date: string, raw: string) => {
    const key = `${projectId}:${date}`;
    const hours = raw.trim() === "" ? 0 : Number(raw);
    if (!Number.isFinite(hours) || hours < 0) {
      toast.error("Indique um número de horas válido");
      return;
    }
    const current = cells[key] ?? 0;
    if (roundHours(hours) === roundHours(current)) {
      setDraft((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    upsert.mutate({ projectId, date, hours }, {
      onSuccess: () => {
        setDraft((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      },
    });
  };

  const totals = days.map((day) => {
    const date = isoDate(day);
    return projects.reduce((sum, project) => sum + (cells[`${project.id}:${date}`] ?? 0), 0);
  });
  const daysClosed = totals.filter((total) => roundHours(total) === roundHours(dailyTarget)).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Horas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Distribua o dia pelos projetos. Meta do dia: {formatHoursLabel(dailyTarget)}
            {data?.monthlyCapacity ? " (do contrato)" : ""}.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Semana anterior" onClick={() => setWeekAnchor((d) => addWeeks(d, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-2 capitalize">
            {format(days[0], "d MMM", { locale: ptBR })} – {format(days[4], "d MMM yyyy", { locale: ptBR })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Semana seguinte" onClick={() => setWeekAnchor((d) => addWeeks(d, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isLoading && projects.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryChip
            label="Esta semana"
            value={`${formatHoursLabel(data?.workedThisWeek ?? 0)} / ${formatHoursLabel(weekTarget)}`}
            hint={`${daysClosed} de ${days.length} dias fechados`}
          />
          <SummaryChip
            label="Este mês"
            value={
              data?.monthlyCapacity
                ? `${formatHoursLabel(data.workedThisMonth)} / ${formatHoursLabel(data.monthlyCapacity)}`
                : formatHoursLabel(data?.workedThisMonth ?? 0)
            }
            hint={data?.monthlyCapacity ? "Capacidade do contrato" : "Sem contrato de horas/mês"}
          />
          <SummaryChip
            label="Projetos com alocação"
            value={String(projects.filter((project) => project.allocatedHours != null).length)}
            hint={`${projects.filter((project) => project.overAllocated).length} acima do previsto`}
          />
          <SummaryChip
            label="Meta diária"
            value={formatHoursLabel(dailyTarget)}
            hint="Segunda a sexta"
          />
        </div>
      )}

      {isLoading ? <Skeleton className="h-64" /> : !projects.length ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Não está em nenhum projeto ativo.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left font-medium p-3 min-w-56">Projeto</th>
                {days.map((day) => (
                  <th key={isoDate(day)} className="font-medium p-3 text-center capitalize min-w-28">
                    {format(day, "EEE d", { locale: ptBR })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b last:border-0">
                  <td className="p-3 align-top">
                    <Link href={`/projects/${project.id}?tab=hours`} className="inline-flex items-center gap-2 font-medium hover:text-primary hover:underline cursor-pointer">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: project.color ?? "#6366f1" }} />
                      <span className="truncate">{project.name}</span>
                    </Link>
                    <CapacityMeter
                      worked={project.workedThisMonth}
                      allocated={project.allocatedHours}
                      over={project.overAllocated}
                    />
                  </td>
                  {days.map((day) => {
                    const date = isoDate(day);
                    const key = `${project.id}:${date}`;
                    const saved = cells[key];
                    const value = draft[key] ?? (saved ? String(saved) : "");
                    return (
                      <td key={key} className="p-2 align-top">
                        <Input
                          type="number"
                          min="0"
                          step="0.25"
                          inputMode="decimal"
                          aria-label={`Horas em ${project.name} a ${format(day, "d MMM", { locale: ptBR })}`}
                          className="h-8 text-center"
                          value={value}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                          onBlur={(e) => saveCell(project.id, date, e.currentTarget.value)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/20">
                <td className="p-3 text-xs font-medium text-muted-foreground">Total do dia</td>
                {totals.map((total, index) => {
                  const rounded = roundHours(total);
                  const delta = roundHours(rounded - dailyTarget);
                  const ok = delta === 0;
                  return (
                    <td key={isoDate(days[index])} className="p-3 text-center">
                      <div className={`text-sm font-semibold tabular-nums ${ok ? "text-foreground" : "text-destructive"}`}>
                        {formatHoursLabel(rounded)}
                      </div>
                      {!ok && (
                        <div className="text-[11px] text-destructive">
                          {delta < 0 ? `Faltam ${formatHoursLabel(roundHours(Math.abs(delta)))}` : `${formatHoursLabel(roundHours(delta))} a mais`}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryChip({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums mt-1">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}
