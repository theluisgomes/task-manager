import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { AiTone } from "@shared/proposalAi";

type Props = {
  field: "intro" | "scope";
  text: string;
  tone: AiTone;
  context: { clientName: string; title: string };
  disabled?: boolean;
  onReplace: (text: string) => void;
};

export function AiRewriteButton({ field, text, tone, context, disabled, onReplace }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const rewrite = trpc.proposals.aiRewrite.useMutation();
  const empty = !text.trim();

  async function start() {
    setResult(null);
    setOpen(true);
    try {
      const res = await rewrite.mutateAsync({ field, text, tone, context });
      setResult(res.text);
    } catch (e) {
      setOpen(false);
      toast.error(e instanceof Error ? e.message : "Falha ao melhorar o texto");
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => !rewrite.isPending && setOpen(o)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
              disabled={disabled || empty || rewrite.isPending}
              onClick={(e) => {
                e.preventDefault();
                start();
              }}
            >
              <Wand2 className="h-3.5 w-3.5" />
              Melhorar texto
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {empty ? "Escreva algo para a IA melhorar" : "Reescrever com IA mantendo o sentido"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(92vw,520px)] space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Antes</p>
            <p className="max-h-60 overflow-y-auto whitespace-pre-line rounded-md bg-muted/50 p-2 text-xs">
              {text}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-primary">Depois</p>
            {result == null ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <p className="max-h-60 overflow-y-auto whitespace-pre-line rounded-md border border-primary/30 p-2 text-xs">
                {result}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={rewrite.isPending}>
            Descartar
          </Button>
          <Button
            size="sm"
            disabled={result == null}
            onClick={() => {
              if (result != null) onReplace(result);
              setOpen(false);
              toast.success("Texto substituído. Revise e salve.");
            }}
          >
            Substituir
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
