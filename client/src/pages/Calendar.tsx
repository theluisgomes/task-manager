import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { fmtBrl, formatRelativePaymentTerm } from "@shared/billing";
import {
  CALENDAR_EVENT_TYPES,
  calendarEventHref,
  calendarEventKindLabel,
  calendarEventTypeMeta,
  type CalendarEventType,
} from "@/components/calendar/eventTypes";
import { CalendarEventDialog, type EditableCalendarEvent } from "@/components/calendar/CalendarEventDialog";

type ViewMode = "day" | "week" | "month";

type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  title: string;
  date: string | Date;
  endDate?: string | Date | null;
  allDay?: boolean | null;
  description?: string | null;
  projectName?: string | null;
  projectId?: number | null;
  proposalId?: number | null;
  leadId?: number | null;
  kind?: string | null;
  calendarEventId?: number | null;
  contractId?: number | null;
  amount?: number | null;
  dueType?: string | null;
  baseEventType?: "assinatura" | "entrega" | null;
  daysAfterBase?: number | null;
  paymentId?: number | null;
  canManagePayment?: boolean | null;
  deliveryCompleted?: boolean | null;
  invoiceIssued?: boolean | null;
  paymentReceived?: boolean | null;
};

function eventIntersectsDay(event: CalendarEvent, day: Date) {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const start = new Date(event.date);
  const end = event.endDate ? new Date(event.endDate) : start;
  return start <= dayEnd && end >= dayStart;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "admin";
  const [view, setView] = useState<ViewMode>("month");
  const [focus, setFocus] = useState(new Date());
  const [selected, setSelected] = useState<Date | undefined>(undefined);
  const [hidden, setHidden] = useState<Set<CalendarEventType>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EditableCalendarEvent | null>(null);

  const range = useMemo(() => {
    if (view === "day") {
      return { start: startOfDay(focus).toISOString(), end: endOfDay(focus).toISOString() };
    }
    if (view === "week") {
      return {
        start: startOfWeek(focus, { weekStartsOn: 1 }).toISOString(),
        end: endOfWeek(focus, { weekStartsOn: 1 }).toISOString(),
      };
    }
    return { start: startOfMonth(focus).toISOString(), end: endOfMonth(focus).toISOString() };
  }, [view, focus]);

  const { data: events, isLoading } = trpc.calendar.events.useQuery(range);
  const updatePayment = trpc.crm.updatePayment.useMutation({
    onSuccess: (res) => toast.success(res.projectCompleted ? "Atualizado. Projeto concluído" : "Atualizado"),
  });

  const visibleEvents = useMemo(
    () => ((events ?? []) as CalendarEvent[]).filter((e) => !hidden.has(e.type)),
    [events, hidden]
  );

  const weekDays = useMemo(
    () => eachDayOfInterval({
      start: startOfWeek(focus, { weekStartsOn: 1 }),
      end: endOfWeek(focus, { weekStartsOn: 1 }),
    }),
    [focus]
  );

  const monthGroups = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(focus), end: endOfMonth(focus) });
    return days
      .map((day) => ({ day, events: visibleEvents.filter((event) => eventIntersectsDay(event, day)) }))
      .filter((group) => group.events.length > 0);
  }, [focus, visibleEvents]);

  const selectedDayEvents = useMemo(() => {
    if (!selected) return [];
    return visibleEvents.filter((event) => eventIntersectsDay(event, selected));
  }, [selected, visibleEvents]);

  const dayEvents = useMemo(
    () => visibleEvents.filter((event) => eventIntersectsDay(event, focus)),
    [visibleEvents, focus]
  );

  const modifiers = useMemo(
    () => ({ hasEvent: visibleEvents.map((e) => new Date(e.date)) }),
    [visibleEvents]
  );

  const countsByType = useMemo(() => {
    const counts: Partial<Record<CalendarEventType, number>> = {};
    for (const e of events ?? []) counts[e.type] = (counts[e.type] ?? 0) + 1;
    return counts;
  }, [events]);

  const toggleType = (type: CalendarEventType) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const openNew = (day?: Date) => {
    if (day) {
      setFocus(day);
      setSelected(day);
    }
    setEditing(null);
    setDialogOpen(true);
  };

  const shift = (dir: number) => {
    setFocus((current) => {
      if (view === "day") return addDays(current, dir);
      if (view === "week") return addWeeks(current, dir);
      return addMonths(current, dir);
    });
    setSelected(undefined);
  };

  const title = view === "day"
    ? format(focus, "d 'de' MMMM yyyy", { locale: ptBR })
    : view === "week"
      ? `${format(weekDays[0], "d MMM", { locale: ptBR })} – ${format(weekDays[6], "d MMM yyyy", { locale: ptBR })}`
      : format(focus, "MMMM yyyy", { locale: ptBR });

  const renderEvent = (ev: CalendarEvent) => (
    <CalendarEventCard
      key={ev.id}
      event={ev}
      onEdit={() => {
        if (!ev.calendarEventId || !ev.contractId) return;
        setEditing({
          id: ev.calendarEventId,
          contractId: ev.contractId,
          title: ev.title,
          description: ev.description,
          startAt: ev.date,
          endAt: ev.endDate,
          allDay: ev.allDay ?? true,
          kind: (ev.kind as EditableCalendarEvent["kind"]) ?? "outro",
        });
        setDialogOpen(true);
      }}
      onPayment={(patch) => {
        if (!ev.paymentId || !ev.projectId) return;
        updatePayment.mutate({ id: ev.paymentId, projectId: ev.projectId, ...patch });
      }}
    />
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Calendário
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Faturamento, tarefas, CRM, propostas e contratos em um só lugar
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex border rounded-lg overflow-hidden" role="group" aria-label="Vista do calendário">
            {(["day", "week", "month"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`px-3 py-1.5 text-xs ${view === mode ? "bg-secondary font-medium" : ""}`}
                onClick={() => {
                  setView(mode);
                  if (mode === "day" && selected) setFocus(selected);
                }}
              >
                {mode === "day" ? "Dia" : mode === "week" ? "Semana" : "Mês"}
              </button>
            ))}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => openNew(view === "month" ? selected : focus)}>
            <Plus className="h-3.5 w-3.5" />
            Novo evento
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Período anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Período seguinte">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="text-sm font-medium capitalize ml-2">{title}</h2>
        </div>
        {view === "month" && selected && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(undefined)}>
            Limpar seleção
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar tipos de evento">
        {CALENDAR_EVENT_TYPES.map((t) => {
          const active = !hidden.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggleType(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active ? "bg-background text-foreground" : "bg-muted/40 text-muted-foreground line-through"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${t.dot} ${active ? "" : "opacity-40"}`} />
              {t.label}
              {countsByType[t.id] ? <span className="tabular-nums text-muted-foreground">{countsByType[t.id]}</span> : null}
            </button>
          );
        })}
      </div>

      {view === "month" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border shadow-sm lg:col-span-1">
            <CardContent className="p-4 flex justify-center">
              <CalendarPicker
                mode="single"
                selected={selected}
                onSelect={setSelected}
                month={focus}
                onMonthChange={setFocus}
                locale={ptBR}
                modifiers={modifiers}
                modifiersClassNames={{ hasEvent: "bg-primary/15 font-semibold" }}
              />
            </CardContent>
          </Card>
          <Card className="border shadow-sm lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {selected
                  ? format(selected, "d 'de' MMMM yyyy", { locale: ptBR })
                  : "Atividades previstas no mês"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? <Skeleton className="h-32" /> : selected ? (
                selectedDayEvents.length ? selectedDayEvents.map(renderEvent) : (
                  <EmptyDay onAdd={() => openNew(selected)} />
                )
              ) : monthGroups.length ? monthGroups.map((group) => (
                <div key={group.day.toISOString()} className="space-y-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setSelected(group.day)}
                  >
                    {format(group.day, "EEEE, d 'de' MMMM", { locale: ptBR })}
                  </button>
                  <div className="space-y-2">{group.events.map(renderEvent)}</div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma atividade prevista neste mês</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {view === "week" && (
        isLoading ? <Skeleton className="h-64" /> : (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {weekDays.map((day) => {
              const items = visibleEvents.filter((event) => eventIntersectsDay(event, day));
              return (
                <Card key={day.toISOString()} className="border shadow-sm min-h-40">
                  <CardHeader className="p-3 pb-1">
                    <button type="button" className="text-left" onClick={() => { setFocus(day); setView("day"); }}>
                      <CardTitle className="text-xs font-medium capitalize">
                        {format(day, "EEE d", { locale: ptBR })}
                      </CardTitle>
                    </button>
                  </CardHeader>
                  <CardContent className="p-3 pt-1 space-y-2">
                    {items.length ? items.map(renderEvent) : (
                      <p className="text-[11px] text-muted-foreground">Sem atividades</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      )}

      {view === "day" && (
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">{format(focus, "EEEE, d 'de' MMMM", { locale: ptBR })}</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => openNew(focus)}>
              <Plus className="h-3 w-3" />
              Evento neste dia
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <Skeleton className="h-32" /> : dayEvents.length ? dayEvents.map(renderEvent) : (
              <EmptyDay onAdd={() => openNew(focus)} />
            )}
          </CardContent>
        </Card>
      )}

      {isGlobalAdmin && <AdminAlertsPanel />}

      <CalendarEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editing}
        defaultDate={view === "month" ? selected : focus}
      />
    </div>
  );
}

function EmptyDay({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-sm text-muted-foreground py-8 text-center space-y-3">
      <p>Nenhum evento neste dia</p>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Adicionar evento a um contrato
      </Button>
    </div>
  );
}

function CalendarEventCard({
  event: ev,
  onEdit,
  onPayment,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onPayment: (patch: { deliveryCompleted?: boolean; invoiceIssued?: boolean; paymentReceived?: boolean }) => void;
}) {
  const { user } = useAuth();
  const meta = calendarEventTypeMeta(ev.type);
  const link = calendarEventHref({
    type: ev.type,
    projectId: ev.projectId ?? undefined,
    proposalId: ev.proposalId ?? undefined,
    leadId: ev.leadId ?? undefined,
  });
  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm flex items-center gap-1.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
            <span className="truncate">{ev.title}</span>
          </p>
          {ev.projectName && <p className="text-xs text-muted-foreground">{ev.projectName}</p>}
          {ev.type === "contract_event" && !ev.allDay && (
            <p className="text-xs text-muted-foreground">
              {format(new Date(ev.date), "HH:mm")}
              {ev.endDate ? ` – ${format(new Date(ev.endDate), "HH:mm")}` : ""}
            </p>
          )}
          {ev.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">{ev.description}</p>}
          {ev.type === "payment" && ev.dueType === "relative" && ev.baseEventType && ev.daysAfterBase != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatRelativePaymentTerm(ev.baseEventType, ev.daysAfterBase)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant={ev.type === "payment" ? "default" : "secondary"} className="text-[10px]">
            {ev.type === "contract_event" ? calendarEventKindLabel(ev.kind) : meta.label}
          </Badge>
          {ev.type === "contract_event" && ev.calendarEventId && ev.contractId && (
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Editar evento" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      {user?.canSeeMoney && ev.amount != null && <p className="text-sm font-semibold">{fmtBrl(ev.amount)}</p>}
      {link && (
        <Link href={link.href} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ExternalLink className="h-3 w-3" />
          {link.label}
        </Link>
      )}
      {user?.canSeeMoney && ev.type === "payment" && ev.paymentId && ev.canManagePayment && (
        <div className="flex flex-wrap gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <Checkbox checked={!!ev.deliveryCompleted} onCheckedChange={(c) => onPayment({ deliveryCompleted: !!c })} />
            Entrega
          </label>
          <label className="flex items-center gap-1.5">
            <Checkbox checked={!!ev.invoiceIssued} onCheckedChange={(c) => onPayment({ invoiceIssued: !!c })} />
            Nota emitida
          </label>
          <label className="flex items-center gap-1.5">
            <Checkbox checked={!!ev.paymentReceived} onCheckedChange={(c) => onPayment({ paymentReceived: !!c })} />
            Recebido
          </label>
        </div>
      )}
    </div>
  );
}

function AdminAlertsPanel() {
  const { data: alerts } = trpc.dashboard.alerts.useQuery();
  if (!alerts?.length) return null;
  return (
    <Card className="border-data-3/40 bg-data-3/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5 text-data-3-ink">
          <AlertTriangle className="h-4 w-4" /> Alertas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.slice(0, 8).map((a, i) => (
          <div key={i} className="text-sm flex justify-between gap-2">
            <span>{a.type.replace(/_/g, " ")} {a.title ?? ""}</span>
            {a.dueDate && <span className="text-muted-foreground text-xs">{format(new Date(a.dueDate), "dd/MM")}</span>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
