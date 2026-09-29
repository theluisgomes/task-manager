import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertTriangle, ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { fmtBrl } from "@shared/billing";
import { itemTotal, proposalSubtotal } from "@shared/proposals";
import {
  AI_SECTIONS,
  AI_TONES,
  BUDGET_TOLERANCE,
  budgetDeviation,
  type AiSection,
  type AiTone,
  type ProposalAiDraft,
} from "@shared/proposalAi";
import type { ProposalFormState } from "./proposalForm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ProposalFormState;
  defaultBudget: number;
  model?: string;
  tone: AiTone;
  onToneChange: (tone: AiTone) => void;
  onApply: (patch: Partial<ProposalFormState>) => void;
};

const ALL_SECTIONS = AI_SECTIONS.map((s) => s.id);

export function AiDraftDialog({
  open,
  onOpenChange,
  form,
  defaultBudget,
  model,
  tone,
  onToneChange,
  onApply,
}: Props) {
  const [step, setStep] = useState<"briefing" | "review">("briefing");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [sections, setSections] = useState<AiSection[]>(ALL_SECTIONS);
  const [draft, setDraft] = useState<ProposalAiDraft | null>(null);
  const [selected, setSelected] = useState<AiSection[]>([]);
  const [appendItems, setAppendItems] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (open) {
      setStep("briefing");
      setDraft(null);
      setBudget(defaultBudget > 0 ? String(defaultBudget) : "");
    }
  }, [open, defaultBudget]);

  const generate = trpc.proposals.aiDraft.useMutation();
  const targetBudget = budget ? parseFloat(budget) : undefined;
  const descriptionOk = description.trim().length >= 20;

  async function run() {
    const id = ++requestId.current;
    setStep("review");
    setDraft(null);
    try {
      const result = await generate.mutateAsync({
        briefing: { description: description.trim(), targetBudget, tone, sections },
        context: {
          leadId: form.leadId,
          clientName: form.clientName,
          title: form.title,
          contactName: form.contactName || undefined,
          intro: form.intro || undefined,
          scope: form.scope || undefined,
          items: form.items.filter((i) => i.description.trim()),
        },
      });
      if (id !== requestId.current) return;
      setDraft(result);
      setSelected(sections.filter((s) => hasSection(result, s)));
    } catch (e) {
      if (id !== requestId.current) return;
      toast.error(e instanceof Error ? e.message : "Falha ao gerar com IA");
      setStep("briefing");
    }
  }

  function cancel() {
    requestId.current++;
    generate.reset();
    setStep("briefing");
  }

  function apply() {
    if (!draft) return;
    const patch: Partial<ProposalFormState> = {};
    if (selected.includes("intro") && draft.intro) patch.intro = draft.intro;
    if (selected.includes("scope") && draft.scope) patch.scope = draft.scope;
    if (selected.includes("paymentTerms") && draft.paymentTerms) patch.paymentTerms = draft.paymentTerms;
    if (selected.includes("deliveryTime") && draft.deliveryTime) patch.deliveryTime = draft.deliveryTime;
    if (selected.includes("items") && draft.items) {
      const existing = form.items.filter((i) => i.description.trim() || i.unitPrice > 0);
      patch.items = appendItems ? [...existing, ...draft.items] : draft.items;
    }
    onApply(patch);
    onOpenChange(false);
    toast.success("Rascunho aplicado. Revise e salve.");
  }

  const toggle = (list: AiSection[], id: AiSection, on: boolean) =>
    on ? Array.from(new Set([...list, id])) : list.filter((s) => s !== id);

  const deviation = draft?.items ? budgetDeviation(draft.items, targetBudget) : null;
  const loading = generate.isPending && !draft;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : (cancel(), onOpenChange(false)))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerar proposta com IA
          </DialogTitle>
          <DialogDescription>
            {step === "briefing"
              ? `Descreva o que será entregue. A IA usa os dados de ${form.clientName || "cliente"} e o conteúdo atual do formulário.`
              : "Revise cada seção e escolha o que aplicar. Nada é salvo até você clicar em Salvar."}
          </DialogDescription>
        </DialogHeader>

        {step === "briefing" ? (
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>O que será entregue *</Label>
              <Textarea
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                placeholder="Ex.: Novo site institucional com 8 páginas, blog, integração com CRM, SEO básico e treinamento da equipe."
              />
              <p className="text-xs text-muted-foreground">
                {description.trim().length < 20
                  ? `Mínimo de 20 caracteres (${description.trim().length}/20)`
                  : `${description.length}/2000`}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Orçamento-alvo (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tom</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={tone}
                  onValueChange={(v) => v && onToneChange(v as AiTone)}
                  className="w-full"
                >
                  {AI_TONES.map((t) => (
                    <ToggleGroupItem key={t.id} value={t.id} className="flex-1 text-xs">
                      {t.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Seções a gerar</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {AI_SECTIONS.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={sections.includes(s.id)}
                      onCheckedChange={(v) => setSections((list) => toggle(list, s.id, v === true))}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              Gerando proposta com {model ?? "IA"}... isso pode levar até um minuto.
            </p>
            {sections.map((s) => (
              <Skeleton key={s} className="h-20 w-full" />
            ))}
          </div>
        ) : draft ? (
          <div className="space-y-3 py-1">
            {sections.map((s) => {
              if (!hasSection(draft, s)) {
                return (
                  <p key={s} className="text-xs text-muted-foreground">
                    {sectionLabel(s)}: a IA não retornou conteúdo.
                  </p>
                );
              }
              return (
                <div key={s} className="rounded-lg border p-3">
                  <label className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={selected.includes(s)}
                      onCheckedChange={(v) => setSelected((list) => toggle(list, s, v === true))}
                    />
                    Aplicar {sectionLabel(s).toLowerCase()}
                  </label>
                  {s === "items" && draft.items ? (
                    <ItemsPreview
                      items={draft.items}
                      deviation={deviation}
                      appendItems={appendItems}
                      onAppendChange={setAppendItems}
                    />
                  ) : (
                    <p className="whitespace-pre-line text-sm text-muted-foreground">
                      {draft[s as Exclude<AiSection, "items">]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "briefing" ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={run} disabled={!descriptionOk || sections.length === 0} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Gerar
              </Button>
            </>
          ) : loading ? (
            <Button variant="ghost" onClick={cancel}>
              Cancelar
            </Button>
          ) : (
            <>
              <Button variant="ghost" className="gap-1.5" onClick={() => setStep("briefing")}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar
              </Button>
              <Button variant="outline" className="gap-1.5" onClick={run}>
                <RefreshCw className="h-3.5 w-3.5" />
                Gerar novamente
              </Button>
              <Button onClick={apply} disabled={selected.length === 0}>
                Aplicar selecionadas
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemsPreview({
  items,
  deviation,
  appendItems,
  onAppendChange,
}: {
  items: NonNullable<ProposalAiDraft["items"]>;
  deviation: number | null;
  appendItems: boolean;
  onAppendChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-normal">Descrição</th>
              <th className="py-1 pl-3 text-right font-normal">Qtd</th>
              <th className="py-1 pl-3 text-right font-normal">Unit.</th>
              <th className="py-1 pl-3 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className="border-t">
                <td className="py-1.5 pr-2">{item.description}</td>
                <td className="py-1.5 pl-3 text-right tabular-nums">{item.quantity}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">{fmtBrl(item.unitPrice)}</td>
                <td className="whitespace-nowrap py-1.5 pl-3 text-right font-medium tabular-nums">
                  {fmtBrl(itemTotal(item))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td className="py-1.5" colSpan={3}>
                Total sugerido
              </td>
              <td className="whitespace-nowrap py-1.5 pl-3 text-right tabular-nums">
                {fmtBrl(proposalSubtotal(items))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {deviation != null && Math.abs(deviation) > BUDGET_TOLERANCE && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Total sugerido difere do orçamento-alvo em {Math.round(deviation * 100)}%.
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox checked={appendItems} onCheckedChange={(v) => onAppendChange(v === true)} />
        Adicionar aos itens existentes (em vez de substituir)
      </label>
    </div>
  );
}

function hasSection(draft: ProposalAiDraft, s: AiSection) {
  return s === "items" ? Boolean(draft.items?.length) : Boolean(draft[s]?.trim());
}

function sectionLabel(s: AiSection) {
  return AI_SECTIONS.find((x) => x.id === s)?.label ?? s;
}
