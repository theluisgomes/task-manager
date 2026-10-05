import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  DollarSign,
  Minus,
  Percent,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { getProjectAreaLabel, isBillableProjectArea } from "@shared/projectAreas";
import { fmtBrl } from "@shared/billing";

function KpiStatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number | null;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bento-card">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xl font-semibold mt-1 tracking-tight">{fmtBrl(value ?? 0)}</p>
          </div>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OperationalSummaryTab() {
  const { data, isLoading } = trpc.finance.summary.useQuery();
  if (isLoading) return <Skeleton className="h-48" />;
  const t = data?.totals;
  if (!t) return null;
  if (!data?.projects.length) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nenhum projeto sob a sua gestão. O resumo mostra contratos e horas dos projetos em que você é owner ou admin.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiStatCard label="Receita orçada" value={t.budgetedRevenue} icon={DollarSign} color="bg-data-1/15 text-data-1-ink" />
        <KpiStatCard label="Receita real" value={t.actualRevenue} icon={TrendingUp} color="bg-data-6/15 text-data-6-ink" />
        <KpiStatCard label="Custo orçado" value={t.budgetedCost} icon={BarChart3} color="bg-data-3/15 text-data-3-ink" />
        <KpiStatCard label="Custo real" value={t.actualCost} icon={Minus} color="bg-data-4/15 text-data-4-ink" />
        <KpiStatCard label="Lucro orçado" value={t.budgetedProfit} icon={Percent} color="bg-data-5/15 text-data-5-ink" />
        <KpiStatCard label="Lucro real" value={t.actualProfit} icon={TrendingUp} color="bg-data-2/15 text-foreground" />
      </div>
    </div>
  );
}

function MoneySource({
  adjusted,
  computed,
  onUseCalculated,
  disabled,
}: {
  adjusted: boolean;
  computed: number;
  onUseCalculated: () => void;
  disabled?: boolean;
}) {
  if (!adjusted) return <p className="text-[10px] text-muted-foreground mt-1">Calculado</p>;
  return (
    <p className="text-[10px] text-muted-foreground mt-1">
      Ajustado · calculado {fmtBrl(computed)}{" "}
      <button type="button" className="underline disabled:opacity-50" disabled={disabled} onClick={onUseCalculated}>
        usar calculado
      </button>
    </p>
  );
}

function parseBrlInput(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function EditableMoneyCell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (value: number) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(value.toFixed(2).replace(".", ","));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseBrlInput(draft);
    setEditing(false);
    if (parsed !== value) onSave(parsed);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-28 text-sm tabular-nums"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="text-sm tabular-nums rounded px-1.5 py-0.5 -mx-1.5 hover:bg-muted/60 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
      title="Clique para editar"
    >
      {fmtBrl(value)}
    </button>
  );
}

function ProjectsFinanceTab() {
  const { data, isLoading } = trpc.finance.summary.useQuery();
  const { data: acceptedProposals } = trpc.proposals.list.useQuery({ status: "accepted" });
  const proposalByProject = useMemo(() => {
    const map = new Map<number, { id: number; number: string }>();
    for (const { proposal } of acceptedProposals ?? []) {
      if (proposal.projectId && !map.has(proposal.projectId)) map.set(proposal.projectId, proposal);
    }
    return map;
  }, [acceptedProposals]);
  const utils = trpc.useUtils();
  const updateFinance = trpc.finance.updateProjectFinance.useMutation({
    onSuccess: () => {
      utils.finance.summary.invalidate();
      toast.success("Valores atualizados");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const saveField = (
    projectId: number,
    field: "budgetedRevenue" | "actualRevenue" | "actualCost",
    value: number | null
  ) => {
    updateFinance.mutate({ projectId, [field]: value });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead><TableHead>Area</TableHead>
          <TableHead>Horas</TableHead>
          <TableHead>Rec. orçada</TableHead><TableHead>Rec. real</TableHead>
          <TableHead>Custo real</TableHead><TableHead>Lucro real</TableHead>
          <TableHead>Origem</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.projects.map((p) => (
          <TableRow key={p.projectId}>
            <TableCell className="font-medium text-sm">
              <Link href={`/projects/${p.projectId}?tab=faturamento`} className="hover:text-primary hover:underline">
                {p.projectName}
              </Link>
            </TableCell>
            <TableCell className="text-sm">{getProjectAreaLabel(p.area as any)}</TableCell>
            <TableCell className="text-sm tabular-nums">{(p.totalHours ?? 0).toFixed(1)}h</TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.budgetedRevenue}
                onSave={(v) => saveField(p.projectId, "budgetedRevenue", v)}
                disabled={!isBillableProjectArea(p.area) || updateFinance.isPending}
              />
            </TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.actualRevenue}
                onSave={(v) => saveField(p.projectId, "actualRevenue", v)}
                disabled={!isBillableProjectArea(p.area) || updateFinance.isPending}
              />
              <MoneySource
                adjusted={p.revenueAdjusted}
                computed={p.computedActualRevenue}
                disabled={!isBillableProjectArea(p.area) || updateFinance.isPending}
                onUseCalculated={() => saveField(p.projectId, "actualRevenue", null)}
              />
            </TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.actualCost}
                onSave={(v) => saveField(p.projectId, "actualCost", v)}
                disabled={!isBillableProjectArea(p.area) || updateFinance.isPending}
              />
              <MoneySource
                adjusted={p.costAdjusted}
                computed={p.computedActualCost}
                disabled={!isBillableProjectArea(p.area) || updateFinance.isPending}
                onUseCalculated={() => saveField(p.projectId, "actualCost", null)}
              />
            </TableCell>
            <TableCell className="text-sm tabular-nums font-medium">
              {fmtBrl(p.actualProfit)}
            </TableCell>
            <TableCell className="text-xs">
              {proposalByProject.get(p.projectId) ? (
                <Link
                  href={`/proposals/${proposalByProject.get(p.projectId)!.id}`}
                  className="text-primary hover:underline"
                >
                  {proposalByProject.get(p.projectId)!.number}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
        {!data?.projects.length && (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
              Nenhum projeto sob a sua gestão
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function ContractPlTab() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data, isLoading } = trpc.finance.contractPl.useQuery();
  const sendReminders = trpc.finance.sendPaymentReminders.useMutation({
    onSuccess: (r) => toast.success(`Lembretes: ${r.sent} enviados, ${r.skipped} ignorados → ${r.to}`),
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="text-xs" disabled={sendReminders.isPending}
            onClick={() => sendReminders.mutate()}>
            Enviar e-mails de vencimento
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contrato</TableHead>
            <TableHead>Projeto</TableHead>
            <TableHead>Receita orçada</TableHead>
            <TableHead>Receita real</TableHead>
            <TableHead>Custo orçado</TableHead>
            <TableHead>Custo real</TableHead>
            <TableHead>Lucro orçado</TableHead>
            <TableHead>Lucro real</TableHead>
            <TableHead>Recebido</TableHead>
            <TableHead>Pendente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.contracts ?? []).map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-sm font-medium">{c.title}<div className="text-xs text-muted-foreground">{c.clientName}</div></TableCell>
              <TableCell className="text-sm">
                {c.projectId ? (
                  <Link href={`/projects/${c.projectId}?tab=faturamento`} className="hover:text-primary hover:underline">
                    {c.projectName ?? `Projeto #${c.projectId}`}
                  </Link>
                ) : "—"}
              </TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedRevenue)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualRevenue)}{c.revenueAdjusted ? " · ajustado" : ""}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedCost)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualCost)}{c.costAdjusted ? " · ajustado" : ""}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedProfit)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualProfit)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.received)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.pending)}</TableCell>
            </TableRow>
          ))}
          {!data?.contracts?.length && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum contrato</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamUtilizationTab() {
  const { data, isLoading } = trpc.finance.teamUtilization.useQuery();
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pessoa</TableHead><TableHead>Projeto</TableHead>
          <TableHead>Horas disponíveis</TableHead><TableHead>Horas lançadas</TableHead><TableHead>Valor/hora</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{row.userName ?? "—"}</TableCell>
            <TableCell className="text-sm">{row.projectName ?? "—"}</TableCell>
            <TableCell className="text-sm">{row.availableHours}</TableCell>
            <TableCell className="text-sm">{row.workedHours}</TableCell>
            <TableCell className="text-sm">{row.hourlyRate ? fmtBrl(row.hourlyRate) : "—"}</TableCell>
          </TableRow>
        ))}
        {!data?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma hora lançada nos seus projetos</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mainTab, setMainTab] = useState("operational");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
            {isAdmin && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">Admin</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Receitas, custos, lucro por projeto e utilização da equipe
          </p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="operational">Resumo</TabsTrigger>
          <TabsTrigger value="projects">Por projeto</TabsTrigger>
          <TabsTrigger value="contracts">Contratos P&L</TabsTrigger>
          <TabsTrigger value="utilization">Utilização equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="operational" className="mt-4"><OperationalSummaryTab /></TabsContent>
        <TabsContent value="projects" className="mt-4"><ProjectsFinanceTab /></TabsContent>
        <TabsContent value="contracts" className="mt-4"><ContractPlTab /></TabsContent>
        <TabsContent value="utilization" className="mt-4"><TeamUtilizationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
