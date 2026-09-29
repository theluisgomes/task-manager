import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getProposalStatusLabel } from "@shared/proposals";

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-data-6/15 text-data-6-ink",
  accepted: "bg-data-1/15 text-data-1-ink",
  rejected: "bg-destructive/10 text-destructive",
};

export function ProposalStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("border-0 font-medium", STATUS_CLASSES[status], className)}>
      {getProposalStatusLabel(status)}
    </Badge>
  );
}
