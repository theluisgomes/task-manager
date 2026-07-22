import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export function BoardMembersList({
  boardId,
  canManage,
}: {
  boardId: number;
  canManage: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: members, isLoading } = trpc.boards.listMembers.useQuery({ boardId });

  const removeMember = trpc.boards.removeMember.useMutation({
    onSuccess: () => {
      utils.boards.listMembers.invalidate({ boardId });
      toast.success("Member removed from board");
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  if (!members?.length) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No members added yet. Add project members to grant board access.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between py-2 gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{m.name ?? m.email}</p>
            <p className="text-xs text-muted-foreground truncate">{m.email}</p>
          </div>
          {canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive shrink-0"
              onClick={() => removeMember.mutate({ boardId, userId: m.userId })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
