import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { addDays, addWeeks, eachDayOfInterval, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const DAILY_TARGET = 8;

function isoDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Clock className="h-6 w-6" />
            Horas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registe as horas por projeto. Cada dia útil deve fechar em {DAILY_TARGET}h.
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
                <th className="text-left font-medium p-3 min-w-40">Projeto</th>
                {days.map((day) => (
                  <th key={isoDate(day)} className="font-medium p-3 text-center capitalize min-w-28">
                    {format(day, "EEE d", { locale: ptBR })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} className="border-b">
                  <td className="p-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: project.color ?? "#6366f1" }} />
                      <span className="truncate">{project.name}</span>
                    </span>
                  </td>
                  {days.map((day) => {
                    const date = isoDate(day);
                    const key = `${project.id}:${date}`;
                    const saved = cells[key];
                    const value = draft[key] ?? (saved ? String(saved) : "");
                    return (
                      <td key={key} className="p-2">
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
              <tr>
                <td className="p-3 text-xs font-medium text-muted-foreground">Total do dia</td>
                {totals.map((total, index) => {
                  const rounded = roundHours(total);
                  const delta = roundHours(rounded - DAILY_TARGET);
                  const ok = delta === 0;
                  return (
                    <td key={isoDate(days[index])} className="p-3 text-center">
                      <div className={`text-sm font-semibold tabular-nums ${ok ? "text-foreground" : "text-destructive"}`}>
                        {rounded}h
                      </div>
                      {!ok && (
                        <div className="text-[11px] text-destructive">
                          {delta < 0 ? `Faltam ${roundHours(Math.abs(delta))}h` : `${roundHours(delta)}h a mais`}
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
