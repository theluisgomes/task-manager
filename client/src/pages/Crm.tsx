import { trpc } from "@/lib/trpc";
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { Flame, Plus, Briefcase, FileText, FilePlus2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { fmtBrl } from "@shared/billing";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

const STATUSES = [
  { id: "prospecting", label: "Prospecção" },
  { id: "proposal", label: "Proposta" },
  { id: "negotiation", label: "Negociação" },
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
] as const;

type LeadStatus = (typeof STATUSES)[number]["id"];

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "rascunho",
  active: "ativo",
  completed: "concluído",
  cancelled: "cancelado",
};

type LeadCardData = {
  id: number;
  clientName: string;
  title: string;
  estimatedValue: string | null;
  notes: string | null;
  isHot: boolean;
  projectId: number | null;
  status: string;
};

function openDraft(lead: LeadCardData): LeadDraft {
  return {
    id: lead.id,
    clientName: lead.clientName,
    title: lead.title,
    estimatedValue: lead.estimatedValue != null ? String(parseFloat(String(lead.estimatedValue))) : "",
    notes: lead.notes ?? "",
    isHot: lead.isHot,
    projectId: lead.projectId,
    status: (STATUSES.some((s) => s.id === lead.status) ? lead.status : "prospecting") as LeadStatus,
  };
}

function LeadFace({ lead }: { lead: LeadCardData }) {
  return (
    <CardContent className="p-2.5 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <p className="text-sm font-medium leading-tight truncate">{lead.title}</p>
        {lead.isHot && <Flame className="h-3 w-3 text-data-3-ink shrink-0" />}
      </div>
      <p className="text-[11px] text-muted-foreground truncate">
        {lead.clientName}
        {lead.estimatedValue != null && ` · ${fmtBrl(parseFloat(String(lead.estimatedValue)))}`}
      </p>
      {lead.notes && <p className="text-[11px] text-muted-foreground truncate">{lead.notes}</p>}
    </CardContent>
  );
}

function LeadCardView({
  lead,
  renaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onOpen,
  onStartRename,
}: {
  lead: LeadCardData;
  renaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onOpen: () => void;
  onStartRename: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `lead-${lead.id}`,
    data: { status: lead.status },
  });
  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="border-0 py-0 gap-0 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
      onClick={onOpen}
    >
      <CardContent className="p-2.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          {renaming ? (
            <Input
              autoFocus
              value={renameValue}
              className="h-7 text-sm"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameCommit}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); onRenameCommit(); }
                if (e.key === "Escape") { e.preventDefault(); onRenameCancel(); }
              }}
            />
          ) : (
            <p
              className="text-sm font-medium leading-tight truncate"
              onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}
            >
              {lead.title}
            </p>
          )}
          {lead.isHot && <Flame className="h-3 w-3 text-data-3-ink shrink-0" />}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">
          {lead.clientName}
          {lead.estimatedValue != null && ` · ${fmtBrl(parseFloat(String(lead.estimatedValue)))}`}
        </p>
        {lead.notes && <p className="text-[11px] text-muted-foreground truncate">{lead.notes}</p>}
      </CardContent>
    </Card>
  );
}

function LeadColumn({
  id,
  label,
  count,
  leadIds,
  children,
  footer,
}: {
  id: string;
  label: string;
  count: number;
  leadIds: string[];
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className="w-64 shrink-0 space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Badge variant="secondary" className="text-[10px] h-4">{count}</Badge>
      </div>
      <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`space-y-1.5 min-h-24 rounded-lg p-1 ${isOver ? "bg-muted/70" : ""}`}
        >
          {children}
        </div>
      </SortableContext>
      {footer}
    </div>
  );
}

type LeadDraft = {
  id: number;
  clientName: string;
  title: string;
  estimatedValue: string;
  notes: string;
  isHot: boolean;
  projectId: number | null;
  status: LeadStatus;
};

export default function Crm() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [isHot, setIsHot] = useState(false);
  const [projectId, setProjectId] = useState("none");
  const [editing, setEditing] = useState<LeadDraft | null>(null);

  const { data: rows, isLoading } = trpc.crm.listLeads.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: proposalCounts } = trpc.proposals.countsByLead.useQuery();

  const createLead = trpc.crm.createStandaloneLead.useMutation({
    onSuccess: () => {
      utils.crm.listLeads.invalidate();
      toast.success("Lead criado");
      setShowCreate(false);
      setClientName("");
      setTitle("");
      setEstimatedValue("");
      setNotes("");
      setIsHot(false);
      setProjectId("none");
    },
    onError: (e) => toast.error(e.message || "Falha ao criar lead"),
  });

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [composer, setComposer] = useState<LeadStatus | null>(null);
  const [composerTitle, setComposerTitle] = useState("");
  const [dragging, setDragging] = useState<LeadCardData | null>(null);
  const openTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const updateLead = trpc.crm.updateLead.useMutation({
    onSuccess: (res) => {
      utils.crm.listLeads.invalidate();
      const integration = res?.integration;
      if (integration) {
        toast.success("Lead ganho. Projeto e contrato atualizados", {
          description: integration.paymentsCreated ? `${integration.paymentsCreated} parcela(s) criada(s).` : undefined,
          action: { label: "Abrir projeto", onClick: () => setLocation(`/projects/${integration.projectId}?tab=faturamento`) },
        });
      }
    },
    onError: (e) => toast.error(e.message || "Falha ao atualizar"),
  });

  const patchLead = (lead: LeadCardData, extra: { status?: LeadStatus; title?: string }, quiet = false) => {
    updateLead.mutate({
      id: lead.id,
      ...(lead.projectId ? { projectId: lead.projectId } : {}),
      ...extra,
    }, {
      onSuccess: (res) => {
        if (!quiet && !res?.integration) toast.success("Lead atualizado");
      },
    });
  };

  const byStatus = useMemo(() => {
    const map: Record<string, typeof rows> = {};
    for (const s of STATUSES) map[s.id] = [];
    for (const row of rows ?? []) {
      const status = row.lead.status ?? "prospecting";
      if (!map[status]) map[status] = [];
      map[status]!.push(row);
    }
    return map;
  }, [rows]);

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CRM</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Pipeline de leads e oportunidades
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/proposals")}>
            <FileText className="h-3.5 w-3.5" />
            Propostas
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            Novo lead
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex gap-3 overflow-x-auto">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-64 w-64 shrink-0" />
          ))}
        </div>
      ) : !rows?.length ? (
        <Empty className="border-dashed border-2 py-16">
          <EmptyMedia variant="icon"><Briefcase /></EmptyMedia>
          <EmptyContent>
            <EmptyTitle>Nenhum lead ainda</EmptyTitle>
            <EmptyDescription>Crie o primeiro lead para montar o pipeline.</EmptyDescription>
            <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />Novo lead</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={(event: DragStartEvent) => {
            suppressClick.current = true;
            if (openTimer.current) window.clearTimeout(openTimer.current);
            const id = Number(String(event.active.id).replace("lead-", ""));
            const row = rows?.find((item) => item.lead.id === id);
            setDragging(row ? row.lead : null);
          }}
          onDragEnd={(event: DragEndEvent) => {
            setDragging(null);
            window.setTimeout(() => { suppressClick.current = false; }, 80);
            const activeId = String(event.active.id);
            const overId = event.over ? String(event.over.id) : "";
            if (!overId) return;
            const leadId = Number(activeId.replace("lead-", ""));
            const row = rows?.find((item) => item.lead.id === leadId);
            if (!row) return;
            const target = overId.startsWith("col-")
              ? overId.slice(4)
              : rows?.find((item) => item.lead.id === Number(overId.replace("lead-", "")))?.lead.status;
            if (!target || target === row.lead.status || !STATUSES.some((s) => s.id === target)) return;
            utils.crm.listLeads.setData(undefined, (current) =>
              current?.map((item) => item.lead.id === leadId
                ? { ...item, lead: { ...item.lead, status: target as LeadStatus } }
                : item)
            );
            patchLead(row.lead, { status: target as LeadStatus }, true);
          }}
          onDragCancel={() => { setDragging(null); suppressClick.current = false; }}
        >
          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {STATUSES.map((col) => {
              const leads = byStatus[col.id] ?? [];
              return (
                <LeadColumn
                  key={col.id}
                  id={`col-${col.id}`}
                  label={col.label}
                  count={leads.length}
                  leadIds={leads.map(({ lead }) => `lead-${lead.id}`)}
                  footer={composer === col.id ? (
                    <div className="space-y-1 px-1">
                      <Input
                        autoFocus
                        value={composerTitle}
                        placeholder="Título do card"
                        className="h-8 text-sm"
                        onChange={(e) => setComposerTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const name = composerTitle.trim();
                            if (!name) return;
                            createLead.mutate({ clientName: "A definir", title: name, status: col.id });
                            setComposer(null);
                            setComposerTitle("");
                          }
                          if (e.key === "Escape") { setComposer(null); setComposerTitle(""); }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7" disabled={!composerTitle.trim() || createLead.isPending} onClick={() => {
                          const name = composerTitle.trim();
                          if (!name) return;
                          createLead.mutate({ clientName: "A definir", title: name, status: col.id });
                          setComposer(null);
                          setComposerTitle("");
                        }}>Adicionar</Button>
                        <Button size="sm" variant="ghost" className="h-7" onClick={() => { setComposer(null); setComposerTitle(""); }}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setComposer(col.id); setComposerTitle(""); }}
                    >
                      <Plus className="h-3.5 w-3.5" /> Adicionar um card
                    </button>
                  )}
                >
                  {leads.map(({ lead }) => (
                    <LeadCardView
                      key={lead.id}
                      lead={lead}
                      renaming={renamingId === lead.id}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={() => {
                        const next = renameValue.trim();
                        if (next && next !== lead.title) patchLead(lead, { title: next }, true);
                        setRenamingId(null);
                      }}
                      onRenameCancel={() => setRenamingId(null)}
                      onOpen={() => {
                        if (suppressClick.current) return;
                        if (openTimer.current) window.clearTimeout(openTimer.current);
                        openTimer.current = window.setTimeout(() => setEditing(openDraft(lead)), 220);
                      }}
                      onStartRename={() => {
                        if (openTimer.current) window.clearTimeout(openTimer.current);
                        setRenamingId(lead.id);
                        setRenameValue(lead.title);
                      }}
                    />
                  ))}
                </LeadColumn>
              );
            })}
          </div>
          <DragOverlay>
            {dragging && (
              <Card className="border-0 py-0 gap-0 shadow-lg w-64 rotate-2">
                <LeadFace lead={dragging} />
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor estimado</Label>
              <Input
                type="number"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contexto, combinados, próximo passo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Projeto (opcional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O vínculo também pode ser feito dentro do card.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isHot} onChange={(e) => setIsHot(e.target.checked)} />
              Lead quente
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button
              disabled={createLead.isPending || !clientName.trim() || !title.trim()}
              onClick={() =>
                createLead.mutate({
                  clientName: clientName.trim(),
                  title: title.trim(),
                  estimatedValue: estimatedValue ? parseFloat(estimatedValue) : undefined,
                  notes: notes.trim() || undefined,
                  projectId: projectId === "none" ? undefined : Number(projectId),
                  isHot,
                })
              }
            >
              {createLead.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing != null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Card do lead</DialogTitle>
          </DialogHeader>
          {editing && (() => {
            const row = rows?.find((item) => item.lead.id === editing.id);
            const proposalCount = proposalCounts?.[editing.id] ?? 0;
            return (
              <div className="grid gap-6 py-2 md:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Título</Label>
                    <Input
                      value={editing.title}
                      onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                      className="text-base font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cliente</Label>
                    <Input
                      value={editing.clientName}
                      onChange={(e) => setEditing({ ...editing, clientName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Observações</Label>
                    <Textarea
                      rows={8}
                      value={editing.notes}
                      onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                      placeholder="Contexto, combinados, próximo passo"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Coluna</Label>
                    <Select
                      value={editing.status}
                      onValueChange={(v) => setEditing({ ...editing, status: v as LeadStatus })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor estimado</Label>
                    <Input
                      type="number"
                      value={editing.estimatedValue}
                      onChange={(e) => setEditing({ ...editing, estimatedValue: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Projeto</Label>
                    <Select
                      value={editing.projectId ? String(editing.projectId) : "none"}
                      onValueChange={(v) => setEditing({ ...editing, projectId: v === "none" ? null : Number(v) })}
                    >
                      <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem projeto</SelectItem>
                        {(projects ?? []).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isHot}
                      onChange={(e) => setEditing({ ...editing, isHot: e.target.checked })}
                    />
                    Lead quente
                  </label>
                  <div className="space-y-1.5 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start gap-1.5"
                      onClick={() => setLocation(`/proposals/new?leadId=${editing.id}`)}
                    >
                      <FilePlus2 className="h-3.5 w-3.5" />
                      Gerar proposta
                    </Button>
                    {proposalCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-1.5"
                        onClick={() => setLocation(`/proposals?leadId=${editing.id}`)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {proposalCount} {proposalCount === 1 ? "proposta" : "propostas"}
                      </Button>
                    )}
                    {editing.projectId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => setLocation(`/projects/${editing.projectId}`)}
                      >
                        {row?.projectName ?? `Projeto #${editing.projectId}`}
                      </Button>
                    )}
                    {row?.contractId && editing.projectId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-1.5"
                        onClick={() => setLocation(`/projects/${editing.projectId}?tab=faturamento`)}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Contrato {fmtBrl(parseFloat(String(row.contractValue ?? 0)))} · {CONTRACT_STATUS_LABEL[row.contractStatus ?? "active"]}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Fechar</Button>
            <Button
              disabled={updateLead.isPending || !editing?.clientName.trim() || !editing?.title.trim()}
              onClick={() => {
                if (!editing) return;
                const raw = editing.estimatedValue.trim();
                const value = raw === "" ? null : Number(raw);
                if (value != null && Number.isNaN(value)) return;
                updateLead.mutate({
                  id: editing.id,
                  projectId: editing.projectId,
                  clientName: editing.clientName.trim(),
                  title: editing.title.trim(),
                  estimatedValue: value,
                  notes: editing.notes.trim() || null,
                  isHot: editing.isHot,
                  status: editing.status,
                }, {
                  onSuccess: (res) => {
                    if (!res?.integration) toast.success("Lead atualizado");
                  },
                });
              }}
            >
              {updateLead.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
