import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Copy,
  Download,
  FileText,
  FolderKanban,
  Handshake,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { fmtBrl } from "@shared/billing";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@shared/proposals";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { formFromProposal, formToInput } from "@/components/proposals/proposalForm";

type Row = inferRouterOutputs<AppRouter>["proposals"]["list"][number];

export default function Proposals() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leadIdParam = new URLSearchParams(search).get("leadId");
  const leadId = leadIdParam ? Number(leadIdParam) : undefined;

  const [status, setStatus] = useState<ProposalStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const utils = trpc.useUtils();

  const { data: rows, isLoading } = trpc.proposals.list.useQuery({
    leadId,
    status: status === "all" ? undefined : status,
  });

  const invalidate = () => {
    utils.proposals.list.invalidate();
    utils.proposals.countsByLead.invalidate();
  };

  const duplicate = trpc.proposals.create.useMutation({
    onSuccess: (id) => {
      invalidate();
      toast.success("Proposta duplicada");
      setLocation(`/proposals/${id}`);
    },
    onError: (e) => toast.error(e.message || "Falha ao duplicar"),
  });

  const remove = trpc.proposals.delete.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Proposta excluída");
      setToDelete(null);
    },
    onError: (e) => toast.error(e.message || "Falha ao excluir"),
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter(({ proposal }) =>
      [proposal.number, proposal.clientName, proposal.title].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    const all = rows ?? [];
    const sum = (list: typeof all) =>
      list.reduce((acc, r) => acc + parseFloat(String(r.proposal.total)), 0);
    return {
      open: sum(all.filter((r) => r.proposal.status === "sent")),
      accepted: sum(all.filter((r) => r.proposal.status === "accepted")),
      count: all.length,
    };
  }, [rows]);

  async function handleDownload(row: Row) {
    try {
      const { downloadProposalPdf } = await import("@/components/proposals/ProposalPdf");
      const form = formFromProposal(row.proposal);
      await downloadProposalPdf({
        ...form,
        number: row.proposal.number,
        issuedAt: new Date(row.proposal.createdAt),
      });
    } catch {
      toast.error("Falha ao gerar o PDF");
    }
  }

  const leadFilterTitle = leadId ? rows?.[0]?.leadTitle ?? `Lead #${leadId}` : null;

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Propostas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Propostas comerciais geradas a partir dos leads do CRM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/crm")}>
            <Handshake className="h-3.5 w-3.5" />
            CRM
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setLocation(leadId ? `/proposals/new?leadId=${leadId}` : "/proposals/new")}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova proposta
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Propostas" value={String(totals.count)} />
        <Stat label="Em aberto (enviadas)" value={fmtBrl(totals.open)} />
        <Stat label="Aceitas" value={fmtBrl(totals.accepted)} accent />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, cliente ou título"
            className="pl-8 h-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ProposalStatus | "all")}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {PROPOSAL_STATUSES.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {leadFilterTitle && (
          <Button
            variant="secondary"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => setLocation("/proposals")}
          >
            Lead: {leadFilterTitle}
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !filtered.length ? (
        <Empty className="border-dashed border-2 py-16">
          <EmptyMedia variant="icon"><FileText /></EmptyMedia>
          <EmptyContent>
            <EmptyTitle>Nenhuma proposta encontrada</EmptyTitle>
            <EmptyDescription>
              Gere uma proposta a partir de um lead do CRM ou comece do zero.
            </EmptyDescription>
            <Button onClick={() => setLocation(leadId ? `/proposals/new?leadId=${leadId}` : "/proposals/new")}>
              <Plus className="mr-2 h-4 w-4" />Nova proposta
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Card className="border-0 shadow-sm py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Número</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Vínculos</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Atualizada</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const p = row.proposal;
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      onClick={() => setLocation(`/proposals/${p.id}`)}
                    >
                      <TableCell className="pl-4 font-mono text-xs">{p.number}</TableCell>
                      <TableCell className="font-medium">{p.clientName}</TableCell>
                      <TableCell className="max-w-[280px] truncate text-muted-foreground">
                        {p.title}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1">
                          {p.leadId && (
                            <Badge
                              variant="secondary"
                              className="cursor-pointer gap-1 text-[10px]"
                              onClick={() => setLocation("/crm")}
                            >
                              <Handshake className="h-3 w-3" />
                              <span className="max-w-[120px] truncate">{row.leadTitle ?? "Lead"}</span>
                            </Badge>
                          )}
                          {p.projectId && (
                            <Badge
                              variant="outline"
                              className="cursor-pointer gap-1 text-[10px]"
                              onClick={() => setLocation(`/projects/${p.projectId}?tab=faturamento`)}
                            >
                              <FolderKanban className="h-3 w-3" />
                              <span className="max-w-[120px] truncate">{row.projectName ?? "Projeto"}</span>
                            </Badge>
                          )}
                          {!p.leadId && !p.projectId && <span className="text-xs text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtBrl(parseFloat(String(p.total)))}
                      </TableCell>
                      <TableCell><ProposalStatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/proposals/${p.id}`)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" />Abrir
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownload(row)}>
                              <Download className="mr-2 h-3.5 w-3.5" />Baixar PDF
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={duplicate.isPending}
                              onClick={() =>
                                duplicate.mutate({
                                  ...formToInput(formFromProposal(p)),
                                  title: `${p.title} (cópia)`,
                                })
                              }
                            >
                              <Copy className="mr-2 h-3.5 w-3.5" />Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setToDelete(row)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir proposta?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete?.proposal.number} será removida permanentemente. O lead vinculado não é alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => toDelete && remove.mutate({ id: toDelete.proposal.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card className="border-0 shadow-sm py-0">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-data-1-ink" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
