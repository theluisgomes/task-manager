import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, CalendarDays, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fmtBrl, formatRelativePaymentTerm } from "@shared/billing";

export default function CalendarPage() {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "admin";
  const [month, setMonth] = useState(new Date());
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const range = useMemo(() => ({
    start: startOfMonth(month).toISOString(),
    end: endOfMonth(month).toISOString(),
  }), [month]);

  const { data: events, isLoading } = trpc.calendar.events.useQuery(range);
  const utils = trpc.useUtils();
  const updatePayment = trpc.crm.updatePayment.useMutation({
    onSuccess: () => {
      utils.calendar.events.invalidate();
      toast.success("Atualizado");
    },
  });

  const selectedDayEvents = useMemo(() => {
    if (!selected || !events) return [];
    const key = format(selected, "yyyy-MM-dd");
    return events.filter((e) => format(new Date(e.date), "yyyy-MM-dd") === key);
  }, [selected, events]);

  const eventDates = useMemo(() => {
    if (!events) return [];
    return events.map((e) => new Date(e.date));
  }, [events]);

  const hasPaymentEvents = selectedDayEvents.some((e) => e.type === "payment");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Calendário
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entregas e faturamento
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border shadow-sm lg:col-span-1">
          <CardContent className="p-4 flex justify-center">
            <CalendarPicker
              mode="single"
              selected={selected}
              onSelect={setSelected}
              month={month}
              onMonthChange={setMonth}
              locale={ptBR}
              modifiers={{ hasEvent: eventDates }}
              modifiersClassNames={{ hasEvent: "bg-primary/15 font-semibold" }}
            />
          </CardContent>
        </Card>

        <Card className="border shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selected ? format(selected, "d 'de' MMMM yyyy", { locale: ptBR }) : "Selecione uma data"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? <Skeleton className="h-32" /> : !selectedDayEvents.length ? (
              <div className="text-sm text-muted-foreground py-8 text-center space-y-2">
                <p>Nenhum evento neste dia</p>
                <p className="text-xs">
                  Cadastre recebíveis em <span className="font-medium text-foreground">Projeto → Faturamento</span> para projetos de Clientes ou Prospectos.
                </p>
              </div>
            ) : selectedDayEvents.map((ev) => (
              <div key={ev.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{ev.title}</p>
                    <p className="text-xs text-muted-foreground">{ev.projectName}</p>
                    {ev.type === "payment" && ev.dueType === "relative" && ev.baseEventType && ev.daysAfterBase != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativePaymentTerm(ev.baseEventType, ev.daysAfterBase)}
                      </p>
                    )}
                  </div>
                  <Badge variant={ev.type === "payment" ? "default" : "secondary"} className="text-[10px]">
                    {ev.type === "payment" ? "Faturamento" : "Tarefa"}
                  </Badge>
                </div>
                {ev.amount != null && (
                  <p className="text-sm font-semibold">{fmtBrl(ev.amount)}</p>
                )}
                {ev.type === "payment" && ev.projectId && (
                  <Link href={`/projects/${ev.projectId}?tab=faturamento`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="h-3 w-3" />
                    Abrir faturamento do projeto
                  </Link>
                )}
                {ev.type === "payment" && ev.paymentId && ev.canManagePayment && (
                  <div className="flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={ev.deliveryCompleted} onCheckedChange={(c) => updatePayment.mutate({ id: ev.paymentId!, projectId: ev.projectId!, deliveryCompleted: !!c })} />
                      Entrega
                    </label>
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={ev.invoiceIssued} onCheckedChange={(c) => updatePayment.mutate({ id: ev.paymentId!, projectId: ev.projectId!, invoiceIssued: !!c })} />
                      Nota emitida
                    </label>
                    <label className="flex items-center gap-1.5">
                      <Checkbox checked={ev.paymentReceived} onCheckedChange={(c) => updatePayment.mutate({ id: ev.paymentId!, projectId: ev.projectId!, paymentReceived: !!c })} />
                      Recebido
                    </label>
                  </div>
                )}
              </div>
            ))}
            {!isLoading && selectedDayEvents.length > 0 && !hasPaymentEvents && (
              <p className="text-xs text-muted-foreground border-t pt-3">
                Para adicionar faturamento ao calendário, cadastre recebíveis em Projeto → Faturamento.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {isGlobalAdmin && (
        <AdminAlertsPanel />
      )}
    </div>
  );
}

function AdminAlertsPanel() {
  const { data: alerts } = trpc.dashboard.alerts.useQuery();
  if (!alerts?.length) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5 text-amber-800">
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
