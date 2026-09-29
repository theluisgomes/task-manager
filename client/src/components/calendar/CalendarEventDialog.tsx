import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CALENDAR_EVENT_KINDS, type CalendarEventKind } from "./eventTypes";

export type EditableCalendarEvent = {
  id: number;
  contractId: number;
  title: string;
  description?: string | null;
  startAt: Date | string;
  endAt?: Date | string | null;
  allDay: boolean;
  kind: CalendarEventKind;
};

type FormState = {
  contractId: number | null;
  title: string;
  description: string;
  kind: CalendarEventKind;
  allDay: boolean;
  start: string;
  end: string;
};

const toInputValue = (value: Date | string, allDay: boolean) =>
  format(new Date(value), allDay ? "yyyy-MM-dd" : "yyyy-MM-dd'T'HH:mm");

function initialState(event: EditableCalendarEvent | null | undefined, contractId: number | null, date: Date): FormState {
  if (event) {
    return {
      contractId: event.contractId,
      title: event.title,
      description: event.description ?? "",
      kind: event.kind,
      allDay: event.allDay,
      start: toInputValue(event.startAt, event.allDay),
      end: event.endAt ? toInputValue(event.endAt, event.allDay) : "",
    };
  }
  return { contractId, title: "", description: "", kind: "reuniao", allDay: true, start: format(date, "yyyy-MM-dd"), end: "" };
}

export function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  contractId,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: EditableCalendarEvent | null;
  /** Locks the dialog to one contract (e.g. inside a project). */
  contractId?: number;
  defaultDate?: Date;
}) {
  const [form, setForm] = useState<FormState>(() => initialState(event, contractId ?? null, defaultDate ?? new Date()));
  const { data: contracts } = trpc.calendar.contracts.useQuery(undefined, { enabled: open && contractId == null && !event });

  useEffect(() => {
    if (open) setForm(initialState(event, contractId ?? null, defaultDate ?? new Date()));
  }, [open, event, contractId, defaultDate]);

  const onDone = (message: string) => {
    toast.success(message);
    onOpenChange(false);
  };
  const create = trpc.calendar.createEvent.useMutation({ onSuccess: () => onDone("Evento criado"), onError: (e) => toast.error(e.message) });
  const update = trpc.calendar.updateEvent.useMutation({ onSuccess: () => onDone("Evento atualizado"), onError: (e) => toast.error(e.message) });
  const remove = trpc.calendar.deleteEvent.useMutation({ onSuccess: () => onDone("Evento excluído"), onError: (e) => toast.error(e.message) });
  const pending = create.isPending || update.isPending || remove.isPending;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const canSubmit = form.title.trim() !== "" && form.start !== "" && form.contractId != null;

  function submit() {
    if (!canSubmit) return;
    const toIso = (v: string) => (form.allDay ? v : new Date(v).toISOString());
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      kind: form.kind,
      allDay: form.allDay,
      startAt: toIso(form.start),
      endAt: form.end ? toIso(form.end) : null,
    };
    if (event) update.mutate({ id: event.id, ...payload });
    else create.mutate({ contractId: form.contractId!, ...payload });
  }

  const noContracts = contractId == null && !event && contracts && contracts.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? "Editar evento" : "Novo evento do contrato"}</DialogTitle>
          <DialogDescription>O evento aparece no calendário e no faturamento do projeto.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {contractId == null && !event && (
            <div className="space-y-1.5">
              <Label>Contrato *</Label>
              {noContracts ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum contrato disponível. Contratos são criados no faturamento do projeto ou ao aceitar uma proposta.
                </p>
              ) : (
                <Select value={form.contractId ? String(form.contractId) : ""} onValueChange={(v) => set("contractId", Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o contrato" /></SelectTrigger>
                  <SelectContent>
                    {contracts?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.projectName ?? c.clientName} · {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Ex.: Reunião de kickoff" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v as CalendarEventKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CALENDAR_EVENT_KINDS.map((k) => (
                    <SelectItem key={k.id} value={k.id}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <Switch
                checked={form.allDay}
                onCheckedChange={(allDay) =>
                  setForm((f) => ({
                    ...f,
                    allDay,
                    start: f.start ? toInputValue(allDay ? f.start.slice(0, 10) + "T00:00" : f.start + "T09:00", allDay) : "",
                    end: f.end ? toInputValue(allDay ? f.end.slice(0, 10) + "T00:00" : f.end + "T10:00", allDay) : "",
                  }))
                }
              />
              Dia inteiro
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input type={form.allDay ? "date" : "datetime-local"} value={form.start} onChange={(e) => set("start", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type={form.allDay ? "date" : "datetime-local"} value={form.end} onChange={(e) => set("end", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {event ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => remove.mutate({ id: event.id })}>
              Excluir
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={!canSubmit || pending}>{event ? "Salvar" : "Criar evento"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
