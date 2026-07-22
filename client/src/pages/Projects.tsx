import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowRight,
  AlertCircle,
  ChevronRight,
  Clock,
  DollarSign,
  FolderKanban,
  Grid3X3,
  List,
  LayoutDashboard,
  Minus,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit3,
  Layers,
  UserPlus,
  Share2,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PROJECT_AREAS, getProjectAreaLabel, isBillableProjectArea, type ProjectArea } from "@shared/projectAreas";
import { computeDueDateFromInput, fmtBrl, formatRelativePaymentTerm } from "@shared/billing";
import { canManageProject } from "@shared/roles";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  AddMemberDialog,
  InviteMemberDialog,
  MemberAvatars,
  MembersList,
} from "@/components/collaboration";

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#0ea5e9", "#3b82f6",
];

const PRIORITY_LABEL: Record<string, string> = {
  normal: "Normal",
  high: "Alta",
  very_high: "Muito alta",
};

const AREA_EXPANDED_KEY = "projects-area-expanded";

type ProjectItem = {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  status: string;
  area: ProjectArea;
  createdAt: Date;
};

function useAreaExpanded() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(AREA_EXPANDED_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch { /* ignore */ }
    return Object.fromEntries(PROJECT_AREAS.map((a) => [a.id, true]));
  });

  const toggle = (area: string) => {
    setExpanded((prev) => {
      const next = { ...prev, [area]: !prev[area] };
      localStorage.setItem(AREA_EXPANDED_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { expanded, toggle };
}

function CreateProjectModal({ open, onClose, defaultArea }: { open: boolean; onClose: () => void; defaultArea?: ProjectArea }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [area, setArea] = useState<ProjectArea>(defaultArea ?? "clientes");
  const [strategicPriority, setStrategicPriority] = useState<"normal" | "high" | "very_high">("normal");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultArea) setArea(defaultArea);
  }, [defaultArea, open]);

  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.projects.listByArea.invalidate();
      utils.projects.hoursSummary.invalidate();
      utils.projects.strategicOverview.invalidate();
      utils.dashboard.recentProjects.invalidate();
      toast.success("Project created");
      setName(""); setDescription(""); setColor(PROJECT_COLORS[0]); setArea("clientes"); setStrategicPriority("normal");
      onClose();
    },
    onError: () => toast.error("Failed to create project"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Project Name</Label>
            <Input id="proj-name" value={name} onChange={(e) => { setName(e.target.value); setNameError(null); }} aria-invalid={!!nameError} />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Area</Label>
            <Select value={area} onValueChange={(v) => setArea(v as ProjectArea)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_AREAS.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade estratégica</Label>
            <Select value={strategicPriority} onValueChange={(v) => setStrategicPriority(v as "normal" | "high" | "very_high")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="very_high">Muito alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" aria-pressed={color === c}
                  className={`h-7 w-7 rounded-lg ${color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={create.isPending} onClick={() => {
            if (!name.trim()) { setNameError("Enter a project name."); return; }
            create.mutate({ name: name.trim(), description, color, area, strategicPriority });
          }}>{create.isPending ? "Creating..." : "Create Project"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project, hoursThisMonth, onSelect }: {
  project: ProjectItem;
  hoursThisMonth?: number;
  onSelect: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); utils.projects.listByArea.invalidate(); toast.success("Project deleted"); },
  });
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); utils.projects.listByArea.invalidate(); },
  });

  return (
    <Card className="border shadow-sm hover:shadow-md transition-all group cursor-pointer" onClick={onSelect}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-semibold text-xs shrink-0"
            style={{ background: project.color ?? "#6366f1" }}>
            {project.name.charAt(0).toUpperCase()}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => updateProject.mutate({ id: project.id, status: "completed" })}>Mark Complete</DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateProject.mutate({ id: project.id, status: "archived" })}>Archive</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => deleteProject.mutate({ id: project.id })}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3 className="font-semibold text-sm truncate group-hover:text-primary">{project.name}</h3>
        {project.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{project.description}</p>}
        <div className="flex items-center justify-between mt-2 gap-1">
          <div className="flex gap-1 flex-wrap">
            <Badge variant="secondary" className="text-[10px] h-4 px-1">{project.status}</Badge>
            {hoursThisMonth != null && hoursThisMonth > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5">
                <Clock className="h-2.5 w-2.5" />{hoursThisMonth}h
              </Badge>
            )}
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
      </CardContent>
    </Card>
  );
}

function BoardCard({
  board,
  projectId,
  canManage,
  onOpen,
}: {
  board: { id: number; name: string; description: string | null };
  projectId: number;
  canManage: boolean;
  onOpen: () => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState(board.name);
  useEffect(() => {
    if (!isRenaming) setName(board.name);
  }, [board.name, isRenaming]);
  const utils = trpc.useUtils();
  const updateBoard = trpc.boards.update.useMutation({
    onSuccess: () => {
      utils.boards.byProject.invalidate({ projectId });
      toast.success("Board renomeado");
    },
    onError: () => toast.error("Não foi possível renomear o board"),
  });
  const commitRename = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== board.name) updateBoard.mutate({ id: board.id, name: trimmed });
    else setName(board.name);
    setIsRenaming(false);
  };
  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setName(board.name);
    setIsRenaming(true);
  };
  return (
    <Card className="border shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={isRenaming ? undefined : onOpen}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setIsRenaming(false);
                    setName(board.name);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="h-7 text-sm"
                autoFocus
                aria-label="Nome do board"
              />
            ) : (
              <p className="font-medium text-sm truncate">{board.name}</p>
            )}
          </div>
          {canManage && !isRenaming && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={startRename}
              title="Renomear board"
              aria-label="Renomear board"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </Button>
          )}
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectHoursTab({ projectId }: { projectId: number }) {
  const { user } = useAuth();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const utils = trpc.useUtils();
  const { data: entries, isLoading } = trpc.timesheets.listByProject.useQuery({ projectId });
  const log = trpc.timesheets.log.useMutation({
    onSuccess: () => {
      utils.timesheets.listByProject.invalidate({ projectId });
      utils.projects.hoursSummary.invalidate();
      setHours(""); setDescription("");
      toast.success("Hours logged");
    },
  });
  const remove = trpc.timesheets.delete.useMutation({
    onSuccess: () => { utils.timesheets.listByProject.invalidate({ projectId }); utils.projects.hoursSummary.invalidate(); },
  });

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Log hours</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36" /></div>
          <div><Label className="text-xs">Hours</Label><Input type="number" step="0.25" min="0.25" value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-24" /></div>
          <div className="flex-1 min-w-[160px]"><Label className="text-xs">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8" placeholder="Optional" /></div>
          <Button size="sm" disabled={log.isPending || !hours} onClick={() => log.mutate({ projectId, date, hours: parseFloat(hours), description: description || undefined })}>Add</Button>
        </CardContent>
      </Card>
      {isLoading ? <Skeleton className="h-32" /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>User</TableHead><TableHead>Hours</TableHead><TableHead>Description</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>
            {entries?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm">{format(new Date(e.date), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-sm">{e.userName ?? "—"}</TableCell>
                <TableCell className="text-sm">{e.hours}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.description ?? "—"}</TableCell>
                <TableCell>{e.userId === user?.id && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove.mutate({ id: e.id, projectId })}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}</TableCell>
              </TableRow>
            ))}
            {!entries?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">No hours logged yet</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function ProjectFinanceTab({ projectId, isGlobalAdmin, area }: { projectId: number; isGlobalAdmin: boolean; area: ProjectArea }) {
  const utils = trpc.useUtils();
  const { data: summary } = trpc.projects.financeSummary.useQuery({ projectId });
  const { data: payments, isLoading: paymentsLoading } = trpc.crm.listPayments.useQuery({ projectId });
  const { data: lead } = trpc.crm.getLead.useQuery({ projectId });
  const { data: acquisition } = trpc.projects.acquisitionCost.useQuery({ projectId }, { enabled: isGlobalAdmin && area === "prospectos" });
  const { data: allProjects } = trpc.projects.list.useQuery(undefined, { enabled: isGlobalAdmin && area === "prospectos" });
  const { data: project } = trpc.projects.byId.useQuery({ id: projectId });

  const [payDesc, setPayDesc] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [dueType, setDueType] = useState<"fixed" | "relative">("relative");
  const [payDue, setPayDue] = useState("");
  const [baseEventType, setBaseEventType] = useState<"assinatura" | "entrega">("assinatura");
  const [baseEventDate, setBaseEventDate] = useState("");
  const [daysAfterBase, setDaysAfterBase] = useState("40");
  const [ddNotes, setDdNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDueType, setEditDueType] = useState<"fixed" | "relative">("fixed");
  const [editDue, setEditDue] = useState("");
  const [editBaseEventType, setEditBaseEventType] = useState<"assinatura" | "entrega">("assinatura");
  const [editBaseEventDate, setEditBaseEventDate] = useState("");
  const [editDaysAfterBase, setEditDaysAfterBase] = useState("40");

  const previewDueDate = useMemo(() => {
    if (dueType === "relative") {
      if (!baseEventDate || !daysAfterBase) return null;
      return computeDueDateFromInput({
        dueType: "relative",
        baseEventDate,
        daysAfterBase: parseInt(daysAfterBase, 10),
      });
    }
    if (!payDue) return null;
    return computeDueDateFromInput({ dueType: "fixed", dueDate: payDue });
  }, [dueType, payDue, baseEventDate, daysAfterBase]);

  const invalidateBilling = () => {
    utils.crm.listPayments.invalidate({ projectId });
    utils.projects.financeSummary.invalidate({ projectId });
    utils.calendar.events.invalidate();
  };

  const createPayment = trpc.crm.createPayment.useMutation({
    onSuccess: () => {
      invalidateBilling();
      setPayDesc("");
      setPayAmount("");
      setPayDue("");
      setBaseEventDate("");
      toast.success("Recebível adicionado");
    },
  });
  const updatePayment = trpc.crm.updatePayment.useMutation({ onSuccess: () => { invalidateBilling(); setEditingId(null); toast.success("Recebível atualizado"); } });
  const updateLead = trpc.crm.updateLead.useMutation({ onSuccess: () => utils.crm.getLead.invalidate({ projectId }) });
  const createLead = trpc.crm.createLead.useMutation({ onSuccess: () => utils.crm.getLead.invalidate({ projectId }) });
  const linkSale = trpc.projects.linkProspectToSale.useMutation({ onSuccess: () => { utils.projects.byId.invalidate({ id: projectId }); toast.success("Vinculado à venda"); } });

  const startEdit = (p: NonNullable<typeof payments>[number]) => {
    setEditingId(p.id);
    setEditAmount(String(parseFloat(p.amount)));
    setEditDueType(p.dueType ?? "fixed");
    setEditDue(p.dueDate ? format(new Date(p.dueDate), "yyyy-MM-dd") : "");
    setEditBaseEventType(p.baseEventType ?? "assinatura");
    setEditBaseEventDate(p.baseEventDate ? format(new Date(p.baseEventDate), "yyyy-MM-dd") : "");
    setEditDaysAfterBase(String(p.daysAfterBase ?? 40));
  };

  const formatPaymentPrazo = (p: NonNullable<typeof payments>[number]) => {
    if (p.dueType === "relative" && p.baseEventType && p.daysAfterBase != null) {
      const relative = formatRelativePaymentTerm(p.baseEventType, p.daysAfterBase);
      const due = p.dueDate ? format(new Date(p.dueDate), "dd/MM/yy") : "—";
      return `${relative} (${due})`;
    }
    return p.dueDate ? format(new Date(p.dueDate), "dd/MM/yy") : "—";
  };

  const handleAddPayment = () => {
    const amount = parseFloat(payAmount);
    if (!amount || Number.isNaN(amount)) {
      toast.error("Informe o valor a faturar");
      return;
    }
    if (dueType === "fixed" && !payDue) {
      toast.error("Informe a data de vencimento");
      return;
    }
    if (dueType === "relative" && (!baseEventDate || !daysAfterBase)) {
      toast.error("Informe o evento base e os dias");
      return;
    }
    createPayment.mutate({
      projectId,
      description: payDesc || undefined,
      amount,
      dueType,
      dueDate: dueType === "fixed" ? payDue : undefined,
      baseEventType: dueType === "relative" ? baseEventType : undefined,
      baseEventDate: dueType === "relative" ? baseEventDate : undefined,
      daysAfterBase: dueType === "relative" ? parseInt(daysAfterBase, 10) : undefined,
    });
  };

  const handleSaveEdit = (paymentId: number) => {
    const amount = parseFloat(editAmount);
    if (!amount || Number.isNaN(amount)) {
      toast.error("Informe o valor");
      return;
    }
    updatePayment.mutate({
      id: paymentId,
      projectId,
      amount,
      dueType: editDueType,
      dueDate: editDueType === "fixed" ? editDue : null,
      baseEventType: editDueType === "relative" ? editBaseEventType : null,
      baseEventDate: editDueType === "relative" ? editBaseEventDate : null,
      daysAfterBase: editDueType === "relative" ? parseInt(editDaysAfterBase, 10) : null,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1">
            <DollarSign className="h-4 w-4" />
            Faturamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Cadastre valor e prazo de pagamento. O recebível aparecerá automaticamente no calendário na data de vencimento.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor a faturar (R$)</Label>
              <Input placeholder="50000" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input placeholder="Parcela 1" value={payDesc} onChange={(e) => setPayDesc(e.target.value)} className="h-8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de prazo</Label>
            <Select value={dueType} onValueChange={(v) => setDueType(v as "fixed" | "relative")}>
              <SelectTrigger className="h-8 w-full sm:w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relative">Prazo relativo (evento + dias)</SelectItem>
                <SelectItem value="fixed">Data fixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {dueType === "relative" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Evento base</Label>
                <Select value={baseEventType} onValueChange={(v) => setBaseEventType(v as "assinatura" | "entrega")}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assinatura">Assinatura</SelectItem>
                    <SelectItem value="entrega">Entrega</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data do evento</Label>
                <Input type="date" value={baseEventDate} onChange={(e) => setBaseEventDate(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dias após</Label>
                <Input type="number" min={0} value={daysAfterBase} onChange={(e) => setDaysAfterBase(e.target.value)} className="h-8" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-xs">Data de vencimento</Label>
              <Input type="date" value={payDue} onChange={(e) => setPayDue(e.target.value)} className="h-8" />
            </div>
          )}
          {previewDueDate && (
            <p className="text-sm text-muted-foreground">
              Vencimento em <span className="font-medium text-foreground">{format(previewDueDate, "dd/MM/yyyy")}</span>
            </p>
          )}
          <Button size="sm" onClick={handleAddPayment} disabled={createPayment.isPending}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Adicionar recebível
          </Button>

          {paymentsLoading ? (
            <Skeleton className="h-24" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments?.map((p) => (
                  <TableRow key={p.id}>
                    {editingId === p.id ? (
                      <>
                        <TableCell colSpan={7} className="p-3">
                          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div>
                                <Label className="text-xs">Valor (R$)</Label>
                                <Input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-8 mt-1" />
                              </div>
                              <div>
                                <Label className="text-xs">Tipo de prazo</Label>
                                <Select value={editDueType} onValueChange={(v) => setEditDueType(v as "fixed" | "relative")}>
                                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="relative">Relativo</SelectItem>
                                    <SelectItem value="fixed">Data fixa</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {editDueType === "relative" ? (
                              <div className="grid gap-2 sm:grid-cols-3">
                                <Select value={editBaseEventType} onValueChange={(v) => setEditBaseEventType(v as "assinatura" | "entrega")}>
                                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="assinatura">Assinatura</SelectItem>
                                    <SelectItem value="entrega">Entrega</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Input type="date" value={editBaseEventDate} onChange={(e) => setEditBaseEventDate(e.target.value)} className="h-8" />
                                <Input type="number" value={editDaysAfterBase} onChange={(e) => setEditDaysAfterBase(e.target.value)} className="h-8" />
                              </div>
                            ) : (
                              <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} className="h-8 max-w-xs" />
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => handleSaveEdit(p.id)}>Salvar</Button>
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                            </div>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-sm">{p.description ?? "—"}</TableCell>
                        <TableCell className="text-sm">{fmtBrl(parseFloat(p.amount))}</TableCell>
                        <TableCell className="text-sm">{formatPaymentPrazo(p)}</TableCell>
                        <TableCell><Checkbox checked={p.deliveryCompleted} onCheckedChange={(c) => updatePayment.mutate({ id: p.id, projectId, deliveryCompleted: !!c })} /></TableCell>
                        <TableCell><Checkbox checked={p.invoiceIssued} onCheckedChange={(c) => updatePayment.mutate({ id: p.id, projectId, invoiceIssued: !!c })} /></TableCell>
                        <TableCell><Checkbox checked={p.paymentReceived} onCheckedChange={(c) => updatePayment.mutate({ id: p.id, projectId, paymentReceived: !!c })} /></TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => startEdit(p)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
                {!payments?.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-8">
                      Nenhum recebível cadastrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {summary && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
            Resumo financeiro
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Receita orçada", value: summary.budgetedRevenue },
                { label: "Receita real", value: summary.actualRevenue },
                { label: "Custo orçado", value: summary.budgetedCost },
                { label: "Custo real", value: summary.actualCost },
                { label: "Lucro orçado", value: summary.budgetedProfit },
                { label: "Lucro real", value: summary.actualProfit },
              ].map((item) => (
                <Card key={item.label} className="border shadow-sm"><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-semibold">{fmtBrl(item.value)}</p>
                </CardContent></Card>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {area === "prospectos" && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
            Lead e due diligence
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Card className="border shadow-sm">
              <CardContent className="p-4 space-y-3">
                {lead ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Checkbox checked={lead.isHot} onCheckedChange={(c) => updateLead.mutate({ id: lead.id, projectId, isHot: !!c })} />
                      <Label className="text-sm">Lead quente</Label>
                      {lead.isHot && <Badge variant="destructive" className="text-[10px]">Hot</Badge>}
                    </div>
                    <Textarea placeholder="Notas de due diligence" value={ddNotes || (lead.dueDiligenceNotes ?? "")} onChange={(e) => setDdNotes(e.target.value)} rows={3} />
                    <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, projectId, dueDiligenceNotes: ddNotes, completeDueDiligence: true })}>Salvar due diligence</Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => createLead.mutate({ projectId, clientName: project?.name ?? "Cliente", title: project?.name ?? "Lead" })}>Criar lead</Button>
                )}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {area === "prospectos" && isGlobalAdmin && acquisition && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronRight className="h-4 w-4" />
            CAC e vínculo com cliente
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <Card className="border shadow-sm"><CardContent className="p-4">
              <p className="text-sm font-medium flex items-center gap-1"><DollarSign className="h-4 w-4" />CAC (captação)</p>
              <p className="text-sm text-muted-foreground">{acquisition.hours}h · {fmtBrl(acquisition.cost)}</p>
              {allProjects && (
                <div className="mt-3 flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Vincular a venda (cliente)</Label>
                    <Select onValueChange={(v) => linkSale.mutate({ prospectProjectId: projectId, clientProjectId: parseInt(v) })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Selecione o projeto cliente" /></SelectTrigger>
                      <SelectContent>
                        {allProjects.filter((p) => p.area === "clientes" && p.id !== projectId).map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {project?.linkedProjectId && <Badge variant="secondary">Vinculado #{project.linkedProjectId}</Badge>}
                </div>
              )}
            </CardContent></Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function ProjectDetail({ projectId }: { projectId: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === "admin";
  const [showInvite, setShowInvite] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const { data: project } = trpc.projects.byId.useQuery({ id: projectId });
  const { data: boards, isLoading } = trpc.boards.byProject.useQuery({ projectId });
  const { data: members, isLoading: membersLoading } = trpc.team.listMembers.useQuery({ projectId });
  const currentUserRole = members?.find((m) => m.userId === user?.id)?.role;
  const canManage = canManageProject(currentUserRole, user?.role);
  const showFaturamento = project ? isBillableProjectArea(project.area) && (canManage || isGlobalAdmin) : false;
  const defaultTab = useMemo(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "faturamento" && showFaturamento) return "faturamento";
    return "boards";
  }, [showFaturamento]);
  const { data: invites } = trpc.team.listInvites.useQuery({ projectId }, { enabled: canManage });
  const utils = trpc.useUtils();
  const createBoard = trpc.boards.create.useMutation({
    onSuccess: (boardId) => {
      utils.boards.byProject.invalidate({ projectId });
      setShowCreateBoard(false);
      setNewBoardName("");
      setLocation(`/projects/${projectId}/board/${boardId}`);
    },
    onError: () => toast.error("Não foi possível criar o board"),
  });

  const openCreateBoard = () => {
    setNewBoardName(project?.name?.trim() || "");
    setShowCreateBoard(true);
  };

  const submitCreateBoard = () => {
    const name = newBoardName.trim();
    if (!name) return;
    createBoard.mutate({ projectId, name });
  };

  if (!project) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/projects")} className="text-muted-foreground hover:text-foreground text-sm">Projects</button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{project.name}</span>
        <Badge variant="outline" className="text-[10px]">{getProjectAreaLabel(project.area)}</Badge>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-semibold" style={{ background: project.color ?? "#6366f1" }}>
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
            {members && members.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <MemberAvatars members={members.map((m) => ({ userId: m.userId, name: m.name, email: m.email }))} />
                <span className="text-xs text-muted-foreground">{members.length} members</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <>
              <Button size="sm" variant="outline" onClick={() => setShowAddMember(true)}><UserPlus className="h-3.5 w-3.5 mr-1" />Add</Button>
              <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}><Share2 className="h-3.5 w-3.5 mr-1" />Share</Button>
            </>
          )}
          <Button size="sm" onClick={openCreateBoard}><Plus className="h-3.5 w-3.5 mr-1" />Novo board</Button>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="boards">Boards</TabsTrigger>
          <TabsTrigger value="hours">Horas</TabsTrigger>
          {showFaturamento && <TabsTrigger value="faturamento">Faturamento</TabsTrigger>}
          {canManage && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>
        <TabsContent value="boards" className="mt-4">
          {isLoading ? <Skeleton className="h-24" /> : !boards?.length ? (
            <Button onClick={openCreateBoard}><Plus className="mr-2 h-4 w-4" />Criar board</Button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {boards.map((board) => (
                <BoardCard
                  key={board.id}
                  board={board}
                  projectId={projectId}
                  canManage={canManage}
                  onOpen={() => setLocation(`/projects/${projectId}/board/${board.id}`)}
                />
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="hours" className="mt-4"><ProjectHoursTab projectId={projectId} /></TabsContent>
        {showFaturamento && (
          <TabsContent value="faturamento" className="mt-4">
            <ProjectFinanceTab projectId={projectId} isGlobalAdmin={!!isGlobalAdmin} area={project.area} />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="team" className="mt-4">
            <MembersList projectId={projectId} members={members} invites={invites} isLoading={membersLoading} currentUserRole={currentUserRole} />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={showCreateBoard} onOpenChange={(open) => { setShowCreateBoard(open); if (!open) setNewBoardName(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo board</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="board-name">Nome</Label>
            <Input
              id="board-name"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Ex.: Sprint, Backlog, Operações"
              onKeyDown={(e) => { if (e.key === "Enter") submitCreateBoard(); }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateBoard(false)}>Cancelar</Button>
            <Button onClick={submitCreateBoard} disabled={!newBoardName.trim() || createBoard.isPending}>
              {createBoard.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InviteMemberDialog open={showInvite} onClose={() => setShowInvite(false)} projectId={projectId}
        onSuccess={() => { utils.team.listInvites.invalidate({ projectId }); utils.team.listMembers.invalidate({ projectId }); }} />
      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} projectId={projectId}
        onSuccess={() => utils.team.listMembers.invalidate({ projectId })} />
    </div>
  );
}

export default function Projects() {
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId ? parseInt(params.projectId) : null;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [createArea, setCreateArea] = useState<ProjectArea | undefined>();
  const [view, setView] = useState<"grid" | "list" | "strategic">("grid");
  const { expanded, toggle } = useAreaExpanded();
  const { data: grouped, isLoading } = trpc.projects.listByArea.useQuery(undefined, { enabled: !projectId });
  const { data: hoursSummary } = trpc.projects.hoursSummary.useQuery(undefined, { enabled: !projectId });
  const { data: strategic, isLoading: strategicLoading } = trpc.projects.strategicOverview.useQuery(
    { limit: 10 },
    { enabled: !projectId && view === "strategic" }
  );

  const totalCount = useMemo(() => {
    if (!grouped) return 0;
    return Object.values(grouped).reduce((s, arr) => s + arr.length, 0);
  }, [grouped]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("create") === "1") { setShowCreate(true); window.history.replaceState({}, "", window.location.pathname); }
  }, []);

  if (projectId) return <ProjectDetail projectId={projectId} />;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground text-sm">{totalCount} projects</p>
        </div>
        <div className="flex gap-2">
          <div className="flex border rounded-lg overflow-hidden">
            <button className={`p-2 ${view === "grid" ? "bg-secondary" : ""}`} onClick={() => setView("grid")} title="Grid"><Grid3X3 className="h-3.5 w-3.5" /></button>
            <button className={`p-2 ${view === "list" ? "bg-secondary" : ""}`} onClick={() => setView("list")} title="Lista"><List className="h-3.5 w-3.5" /></button>
            <button className={`p-2 ${view === "strategic" ? "bg-secondary" : ""}`} onClick={() => setView("strategic")} title="Vista estratégica"><LayoutDashboard className="h-3.5 w-3.5" /></button>
          </div>
          <Button size="sm" onClick={() => { setCreateArea(undefined); setShowCreate(true); }}><Plus className="h-3.5 w-3.5 mr-1" />New Project</Button>
        </div>
      </div>

      {view === "strategic" ? (
        strategicLoading ? (
          <div className="flex gap-3 overflow-x-auto pb-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-72 shrink-0" />)}</div>
        ) : !strategic?.length ? (
          <Empty className="border-dashed border-2 py-16">
            <EmptyMedia variant="icon"><FolderKanban /></EmptyMedia>
            <EmptyContent>
              <EmptyTitle>Nenhum projeto ativo</EmptyTitle>
              <EmptyDescription>Crie projetos ativos para ver a vista estratégica (até 10).</EmptyDescription>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-2">
            {strategic.map((row) => (
              <Card
                key={row.id}
                className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0 w-72"
                onClick={() => {
                  if (row.canonicalBoardId) setLocation(`/projects/${row.id}/board/${row.canonicalBoardId}`);
                  else setLocation(`/projects/${row.id}`);
                }}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-semibold shrink-0"
                      style={{ background: row.color ?? "#6366f1" }}>
                      {row.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{row.name}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] h-4">{PRIORITY_LABEL[row.strategicPriority] ?? row.strategicPriority}</Badge>
                        <Badge variant="outline" className="text-[10px] h-4">{getProjectAreaLabel(row.area as ProjectArea)}</Badge>
                        {row.isBlocked && (
                          <Badge variant="outline" className="text-[10px] h-4 border-amber-500 text-amber-700">
                            <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Bloqueado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs space-y-1.5 text-muted-foreground">
                    <div>
                      <span className="font-medium text-foreground">Próximo deadline: </span>
                      {row.nearestDeadline
                        ? `${row.nearestDeadline.title} · ${format(new Date(row.nearestDeadline.dueDate!), "dd/MM")}`
                        : "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Último atendido: </span>
                      {row.lastCompletedDeadline
                        ? `${row.lastCompletedDeadline.title} · ${format(new Date(row.lastCompletedDeadline.dueDate!), "dd/MM")}`
                        : "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Responsável: </span>
                      {row.assignees?.length
                        ? row.assignees.map((a) => a.name ?? `User ${a.id}`).join(", ")
                        : "—"}
                    </div>
                    {user?.role === "admin" && row.finance && (
                      <div className="pt-1 border-t space-y-0.5">
                        <div>Receita: {fmtBrl(row.finance.projectedRevenue)}</div>
                        <div>Recebido: {fmtBrl(row.finance.received)}</div>
                        <div>Custo HH: {fmtBrl(row.finance.hhCost)}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : totalCount === 0 ? (
        <Empty className="border-dashed border-2 py-16">
          <EmptyMedia variant="icon"><FolderKanban /></EmptyMedia>
          <EmptyContent>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>Create a project to organize boards and tasks by business area.</EmptyDescription>
            <Button onClick={() => setShowCreate(true)}><Plus className="mr-2 h-4 w-4" />Create project</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="space-y-3">
          {PROJECT_AREAS.map(({ id, label }) => {
            const areaProjects = (grouped?.[id] ?? []) as ProjectItem[];
            if (!areaProjects.length) return null;
            const isOpen = expanded[id] !== false;
            return (
              <Collapsible key={id} open={isOpen} onOpenChange={() => toggle(id)}>
                <div className="flex items-center gap-2 border-b pb-2">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1 h-8 px-2 font-semibold">
                      {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {label}
                      <Badge variant="secondary" className="text-[10px] ml-1">{areaProjects.length}</Badge>
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="pt-3">
                  <div className={view === "grid" ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2" : "space-y-2"}>
                    {areaProjects.map((project) => (
                      <ProjectCard key={project.id} project={project} hoursThisMonth={hoursSummary?.[project.id]}
                        onSelect={() => setLocation(`/projects/${project.id}`)} />
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={() => { setCreateArea(id); setShowCreate(true); }}>
                    <Plus className="h-3 w-3 mr-1" />Add to {label}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} defaultArea={createArea} />
    </div>
  );
}
