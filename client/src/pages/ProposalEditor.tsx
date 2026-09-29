import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArrowLeft, Download, Handshake, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AiDraftDialog } from "@/components/proposals/AiDraftDialog";
import { AiRewriteButton } from "@/components/proposals/AiRewriteButton";
import type { AiTone } from "@shared/proposalAi";
import { toast } from "sonner";
import { fmtBrl } from "@shared/billing";
import {
  INSTALLMENT_PRESETS,
  PROPOSAL_STATUSES,
  installmentsAreValid,
  installmentsPercentTotal,
  itemTotal,
  leadStatusForProposal,
  proposalSubtotal,
  proposalTotal,
  type ProposalInstallment,
  type ProposalItem,
  type ProposalStatus,
} from "@shared/proposals";
import { downloadProposalPdf, type ProposalPdfData } from "@/components/proposals/ProposalPdf";
import { ProposalPdfPreview } from "@/components/proposals/ProposalPdfPreview";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import {
  emptyProposalForm,
  formFromProposal,
  formToInput,
  type ProposalFormState,
} from "@/components/proposals/proposalForm";

const LEAD_STATUS_LABEL: Record<string, string> = {
  proposal: "Proposta",
  won: "Ganho",
  lost: "Perdido",
};

function useIsNarrow(breakpoint = 1100) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return narrow;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ProposalEditor() {
  const params = useParams<{ id?: string }>();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const isNarrow = useIsNarrow();
  const utils = trpc.useUtils();

  const proposalId = params.id ? Number(params.id) : null;
  const initialLeadId = Number(new URLSearchParams(search).get("leadId")) || null;

  const [form, setForm] = useState<ProposalFormState>(emptyProposalForm);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const hydrated = useRef(false);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiTone, setAiTone] = useState<AiTone>("consultivo");
  const { data: aiStatus } = trpc.proposals.aiStatus.useQuery(undefined, { staleTime: 60_000 });
  const aiEnabled = aiStatus?.enabled ?? false;

  const { data: leads } = trpc.crm.listLeads.useQuery();
  const { data: proposal, isLoading } = trpc.proposals.get.useQuery(
    { id: proposalId ?? 0 },
    { enabled: proposalId != null }
  );

  useEffect(() => {
    hydrated.current = false;
  }, [proposalId]);

  useEffect(() => {
    if (hydrated.current) return;
    if (proposalId != null) {
      if (!proposal) return;
      const next = formFromProposal(proposal);
      setForm(next);
      setSavedSnapshot(JSON.stringify(formToInput(next)));
      hydrated.current = true;
      return;
    }
    if (initialLeadId && !leads) return;
    const next = emptyProposalForm();
    const row = leads?.find((r) => r.lead.id === initialLeadId);
    setForm(row ? applyLead(next, row.lead) : next);
    setSavedSnapshot(null);
    hydrated.current = true;
  }, [proposalId, proposal, leads, initialLeadId]);

  const dirty = savedSnapshot !== JSON.stringify(formToInput(form));
  const canSave = form.clientName.trim() !== "" && form.title.trim() !== "";

  const invalidate = () => {
    utils.proposals.list.invalidate();
    utils.proposals.countsByLead.invalidate();
    if (proposalId) utils.proposals.get.invalidate({ id: proposalId });
  };

  const create = trpc.proposals.create.useMutation();
  const update = trpc.proposals.update.useMutation();
  const setStatus = trpc.proposals.setStatus.useMutation();
  const saving = create.isPending || update.isPending;

  async function save(): Promise<number | null> {
    if (!canSave) {
      toast.error("Preencha cliente e título");
      return null;
    }
    const input = formToInput(form);
    try {
      if (proposalId) {
        await update.mutateAsync({ id: proposalId, ...input });
        setSavedSnapshot(JSON.stringify(input));
        invalidate();
        toast.success("Proposta salva");
        return proposalId;
      }
      const id = await create.mutateAsync(input);
      invalidate();
      toast.success("Proposta criada");
      setLocation(`/proposals/${id}`, { replace: true });
      return id;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      return null;
    }
  }

  async function changeStatus(status: ProposalStatus) {
    const id = dirty || !proposalId ? await save() : proposalId;
    if (!id) return;
    try {
      const res = await setStatus.mutateAsync({ id, status });
      invalidate();
      utils.crm.listLeads.invalidate();
      if (res.integration) {
        const { projectId, paymentsCreated } = res.integration;
        toast.success("Proposta aceita. Lead ganho, projeto e contrato vinculados", {
          description: paymentsCreated
            ? `${paymentsCreated} parcela(s) criada(s) no faturamento.`
            : "O contrato já tinha parcelas, nenhuma foi duplicada.",
          action: { label: "Abrir projeto", onClick: () => setLocation(`/projects/${projectId}?tab=faturamento`) },
        });
        return;
      }
      const leadStatus = leadStatusForProposal(status);
      toast.success(
        res.leadUpdated && leadStatus
          ? `Status atualizado. Lead movido para "${LEAD_STATUS_LABEL[leadStatus]}" no CRM`
          : "Status atualizado"
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar status");
    }
  }

  const pdfData: ProposalPdfData = useMemo(
    () => ({
      ...form,
      number: proposal?.number ?? "RASCUNHO",
      issuedAt: proposal ? new Date(proposal.createdAt) : new Date(),
    }),
    [form, proposal]
  );
  const previewData = useDebounced(pdfData, 400);

  async function handleDownload() {
    try {
      await downloadProposalPdf(pdfData);
    } catch {
      toast.error("Falha ao gerar o PDF");
    }
  }

  const set = <K extends keyof ProposalFormState>(key: K, value: ProposalFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  if (proposalId != null && isLoading) {
    return <Skeleton className="m-6 h-[70vh]" />;
  }
  if (proposalId != null && !isLoading && !proposal) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Proposta não encontrada.{" "}
        <button className="text-primary hover:underline" onClick={() => setLocation("/proposals")}>
          Voltar para a lista
        </button>
      </div>
    );
  }

  const leadValue = leads?.find((r) => r.lead.id === form.leadId)?.lead.estimatedValue;
  const defaultBudget =
    leadValue != null ? parseFloat(String(leadValue)) : proposalTotal(form.items, form.discount);

  const formPanel = (
    <ProposalFormFields
      form={form}
      set={set}
      setForm={setForm}
      leads={leads ?? []}
      ai={{ enabled: aiEnabled, tone: aiTone }}
    />
  );
  const previewPanel = (
    <div className="h-full bg-muted/40">
      <ProposalPdfPreview data={previewData} />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2.5">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLocation("/proposals")} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">
              {form.title.trim() || "Nova proposta"}
            </p>
            {proposal && <ProposalStatusBadge status={proposal.status} />}
            {dirty && proposalId && (
              <span className="shrink-0 text-xs text-muted-foreground">Não salvo</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {proposal?.number ?? "Rascunho"} · Total {fmtBrl(proposalTotal(form.items, form.discount))}
          </p>
        </div>
        {form.leadId && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setLocation("/crm")}>
            <Handshake className="h-3.5 w-3.5" />
            Ver no CRM
          </Button>
        )}
        <Select
          value={proposal?.status ?? "draft"}
          onValueChange={(v) => changeStatus(v as ProposalStatus)}
          disabled={setStatus.isPending || saving || !canSave}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROPOSAL_STATUSES.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={aiEnabled ? -1 : 0}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-primary/40 text-primary hover:text-primary"
                disabled={!aiEnabled}
                onClick={() => setAiOpen(true)}
                aria-label="Gerar com IA"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className={isNarrow ? "sr-only" : undefined}>Gerar com IA</span>
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {aiEnabled
              ? `Rascunho com ${aiStatus?.model ?? "IA"}`
              : "IA não configurada: defina OPENROUTER_API_KEY no .env e reinicie o servidor"}
          </TooltipContent>
        </Tooltip>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDownload}>
          <Download className="h-3.5 w-3.5" />
          Baixar PDF
        </Button>
        <Button size="sm" className="gap-1.5" onClick={save} disabled={saving || !canSave || (!dirty && !!proposalId)}>
          <Save className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      {isNarrow ? (
        <Tabs defaultValue="form" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3">
            <TabsTrigger value="form">Editar</TabsTrigger>
            <TabsTrigger value="preview">Prévia</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="min-h-0 flex-1 overflow-y-auto">{formPanel}</TabsContent>
          <TabsContent value="preview" className="min-h-0 flex-1">{previewPanel}</TabsContent>
        </Tabs>
      ) : (
        <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={45} minSize={30}>
            <div className="h-full overflow-y-auto">{formPanel}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={55} minSize={30}>
            {previewPanel}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      {aiEnabled && (
        <AiDraftDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          form={form}
          defaultBudget={defaultBudget}
          model={aiStatus?.model}
          tone={aiTone}
          onToneChange={setAiTone}
          onApply={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
      )}
    </div>
  );
}

type LeadRow = inferRouterOutputs<AppRouter>["crm"]["listLeads"][number];

function applyLead(form: ProposalFormState, lead: LeadRow["lead"]): ProposalFormState {
  const value = lead.estimatedValue != null ? parseFloat(String(lead.estimatedValue)) : 0;
  const onlyBlankItem =
    form.items.length === 0 ||
    (form.items.length === 1 && !form.items[0].description.trim() && !form.items[0].unitPrice);
  return {
    ...form,
    leadId: lead.id,
    projectId: lead.projectId ?? null,
    clientName: lead.clientName,
    title: lead.title,
    items: onlyBlankItem && value > 0
      ? [{ description: lead.title, quantity: 1, unitPrice: value }]
      : form.items,
  };
}

function ProposalFormFields({
  form,
  set,
  setForm,
  leads,
  ai,
}: {
  form: ProposalFormState;
  set: <K extends keyof ProposalFormState>(key: K, value: ProposalFormState[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ProposalFormState>>;
  leads: LeadRow[];
  ai: { enabled: boolean; tone: AiTone };
}) {
  const rewriteContext = { clientName: form.clientName, title: form.title };
  const rewriteAction = (field: "intro" | "scope") =>
    ai.enabled ? (
      <AiRewriteButton
        field={field}
        text={form[field]}
        tone={ai.tone}
        context={rewriteContext}
        onReplace={(text) => set(field, text)}
      />
    ) : null;
  const subtotal = proposalSubtotal(form.items);
  const total = proposalTotal(form.items, form.discount);

  const updateItem = (idx: number, patch: Partial<ProposalItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <FormSection title="Cliente" description="Selecione um lead do CRM para preencher automaticamente.">
        <div className="space-y-1.5">
          <Label>Lead do CRM</Label>
          <Select
            value={form.leadId ? String(form.leadId) : "none"}
            onValueChange={(v) => {
              if (v === "none") {
                setForm((f) => ({ ...f, leadId: null, projectId: null }));
                return;
              }
              const row = leads.find((r) => r.lead.id === Number(v));
              if (row) setForm((f) => applyLead(f, row.lead));
            }}
          >
            <SelectTrigger><SelectValue placeholder="Sem lead vinculado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sem lead vinculado</SelectItem>
              {leads.map(({ lead }) => (
                <SelectItem key={lead.id} value={String(lead.id)}>
                  {lead.clientName} · {lead.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente *">
            <Input value={form.clientName} onChange={(e) => set("clientName", e.target.value)} />
          </Field>
          <Field label="Título da proposta *">
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field label="Contato">
            <Input value={form.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Nome do responsável" />
          </Field>
          <Field label="E-mail do contato">
            <Input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <Separator />

      <FormSection title="Conteúdo">
        <Field label="Apresentação" action={rewriteAction("intro")}>
          <Textarea
            rows={4}
            value={form.intro}
            onChange={(e) => set("intro", e.target.value)}
            placeholder="Contexto do cliente e objetivo da proposta"
          />
        </Field>
        <Field label="Escopo" action={rewriteAction("scope")}>
          <Textarea
            rows={5}
            value={form.scope}
            onChange={(e) => set("scope", e.target.value)}
            placeholder="Entregas, etapas e o que está incluído"
          />
        </Field>
      </FormSection>

      <Separator />

      <FormSection title="Investimento">
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_64px_110px_96px_32px] gap-2 px-1 text-xs text-muted-foreground">
            <span>Descrição</span>
            <span className="text-right">Qtd</span>
            <span className="text-right">Valor unit.</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          {form.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_64px_110px_96px_32px] items-center gap-2">
              <Input
                value={item.description}
                onChange={(e) => updateItem(idx, { description: e.target.value })}
                placeholder="Item ou serviço"
              />
              <Input
                type="number"
                min={0}
                className="text-right"
                value={item.quantity}
                onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="text-right"
                value={item.unitPrice}
                onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
              />
              <span className="text-right text-sm font-medium tabular-nums">{fmtBrl(itemTotal(item))}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                aria-label="Remover item"
                onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: 1, unitPrice: 0 }] }))
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar item
          </Button>
        </div>
        <div className="ml-auto w-full max-w-xs space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{fmtBrl(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Desconto (R$)</span>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-8 w-28 text-right"
              value={form.discount}
              onChange={(e) => set("discount", parseFloat(e.target.value) || 0)}
            />
          </div>
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{fmtBrl(total)}</span>
          </div>
        </div>
      </FormSection>

      <Separator />

      <FormSection title="Condições">
        <Field label="Condições de pagamento">
          <Textarea rows={2} value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} />
        </Field>
        <InstallmentsEditor
          installments={form.installments}
          total={total}
          onChange={(installments) => set("installments", installments)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prazo de entrega">
            <Input value={form.deliveryTime} onChange={(e) => set("deliveryTime", e.target.value)} placeholder="Ex.: 30 dias úteis" />
          </Field>
          <Field label="Válida até">
            <Input type="date" value={form.validUntil} onChange={(e) => set("validUntil", e.target.value)} />
          </Field>
        </div>
        <Field label="Observações">
          <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormSection>
    </div>
  );
}

function InstallmentsEditor({
  installments,
  total,
  onChange,
}: {
  installments: ProposalInstallment[];
  total: number;
  onChange: (installments: ProposalInstallment[]) => void;
}) {
  const percentTotal = installmentsPercentTotal(installments);
  const valid = installments.length === 0 || installmentsAreValid(installments);
  const update = (idx: number, patch: Partial<ProposalInstallment>) =>
    onChange(installments.map((inst, i) => (i === idx ? { ...inst, ...patch } : inst)));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Label>Parcelas</Label>
          <p className="text-xs text-muted-foreground">
            Geradas automaticamente no faturamento do projeto quando a proposta for aceita.
          </p>
        </div>
        <Select
          value=""
          onValueChange={(id) => {
            const preset = INSTALLMENT_PRESETS.find((p) => p.id === id);
            if (preset) onChange(preset.installments.map((i) => ({ ...i })));
          }}
        >
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Aplicar modelo" /></SelectTrigger>
          <SelectContent>
            {INSTALLMENT_PRESETS.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {installments.map((inst, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_72px_150px_32px] items-center gap-2">
          <Input
            value={inst.description}
            onChange={(e) => update(idx, { description: e.target.value })}
            placeholder="Descrição"
          />
          <Input
            type="number"
            min={0}
            max={100}
            step="0.01"
            className="text-right"
            aria-label="Percentual"
            value={inst.percent}
            onChange={(e) => update(idx, { percent: parseFloat(e.target.value) || 0 })}
          />
          <div className="flex items-center gap-1">
            <Select
              value={inst.dueType === "fixed" ? "fixed" : inst.baseEventType ?? "assinatura"}
              onValueChange={(v) =>
                update(idx, v === "fixed"
                  ? { dueType: "fixed", baseEventType: null, daysAfterBase: null }
                  : { dueType: "relative", baseEventType: v as "assinatura" | "entrega", dueDate: null, daysAfterBase: inst.daysAfterBase ?? 0 })
              }
            >
              <SelectTrigger className="h-9 w-[92px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assinatura">Assinatura</SelectItem>
                <SelectItem value="entrega">Entrega</SelectItem>
                <SelectItem value="fixed">Data fixa</SelectItem>
              </SelectContent>
            </Select>
            {inst.dueType === "fixed" ? (
              <Input
                type="date"
                className="px-1 text-xs"
                value={inst.dueDate ?? ""}
                onChange={(e) => update(idx, { dueDate: e.target.value || null })}
              />
            ) : (
              <Input
                type="number"
                min={0}
                className="px-1 text-right text-xs"
                aria-label="Dias após o evento"
                title="Dias após o evento"
                value={inst.daysAfterBase ?? 0}
                onChange={(e) => update(idx, { daysAfterBase: parseInt(e.target.value, 10) || 0 })}
              />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Remover parcela"
            onClick={() => onChange(installments.filter((_, i) => i !== idx))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            onChange([
              ...installments,
              { description: `Parcela ${installments.length + 1}`, percent: Math.max(0, 100 - percentTotal), dueType: "relative", baseEventType: "assinatura", daysAfterBase: 30 },
            ])
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar parcela
        </Button>
        {installments.length > 0 ? (
          <span className={`text-xs tabular-nums ${valid ? "text-muted-foreground" : "text-destructive"}`}>
            {percentTotal}% · {fmtBrl((total * percentTotal) / 100)}
            {!valid && " (a soma precisa dar 100%)"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Sem parcelas: será gerada 1 parcela de 100% na assinatura.</span>
        )}
      </div>
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <Label>{label}</Label>
        {action}
      </div>
      {children}
    </div>
  );
}
