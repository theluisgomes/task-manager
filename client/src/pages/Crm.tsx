import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Flame, Plus, Briefcase } from "lucide-react";
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

export default function Crm() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [showCreate, setShowCreate] = useState(false);
  const [clientName, setClientName] = useState("");
  const [title, setTitle] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [isHot, setIsHot] = useState(false);

  const { data: rows, isLoading } = trpc.crm.listLeads.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();

  const createLead = trpc.crm.createStandaloneLead.useMutation({
    onSuccess: () => {
      utils.crm.listLeads.invalidate();
      toast.success("Lead criado");
      setShowCreate(false);
      setClientName("");
      setTitle("");
      setEstimatedValue("");
      setIsHot(false);
    },
    onError: (e) => toast.error(e.message || "Falha ao criar lead"),
  });

  const updateLead = trpc.crm.updateLead.useMutation({
    onSuccess: () => {
      utils.crm.listLeads.invalidate();
      toast.success("Lead atualizado");
    },
    onError: (e) => toast.error(e.message || "Falha ao atualizar"),
  });

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
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
          <Plus className="h-3.5 w-3.5" />
          Novo lead
        </Button>
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
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {STATUSES.map((col) => (
            <div key={col.id} className="w-64 shrink-0 space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {col.label}
                </p>
                <Badge variant="secondary" className="text-[10px] h-4">
                  {byStatus[col.id]?.length ?? 0}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[120px]">
                {(byStatus[col.id] ?? []).map(({ lead, projectName }) => (
                  <Card key={lead.id} className="border-0 shadow-sm">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium leading-snug">{lead.title}</p>
                        {lead.isHot && (
                          <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{lead.clientName}</p>
                      {lead.estimatedValue != null && (
                        <p className="text-xs font-medium">{fmtBrl(parseFloat(String(lead.estimatedValue)))}</p>
                      )}
                      {lead.projectId && (
                        <button
                          type="button"
                          className="text-[11px] text-primary hover:underline"
                          onClick={() => setLocation(`/projects/${lead.projectId}`)}
                        >
                          {projectName ?? `Projeto #${lead.projectId}`}
                        </button>
                      )}
                      <Select
                        value={lead.status}
                        onValueChange={(v) => {
                          updateLead.mutate({
                            id: lead.id,
                            projectId: lead.projectId ?? undefined,
                            status: v as LeadStatus,
                          });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
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
              <Label>Projeto (opcional)</Label>
              <Select
                value="none"
                onValueChange={() => {}}
              >
                <SelectTrigger><SelectValue placeholder="Sem projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem projeto</SelectItem>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Você pode vincular depois no faturamento do projeto.
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
                  isHot,
                })
              }
            >
              {createLead.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
