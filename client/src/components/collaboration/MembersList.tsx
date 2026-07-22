import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { canManageProject } from "@shared/roles";
import { RoleSelect } from "./RoleSelect";

type ProjectMember = {
  id: number;
  userId: number;
  role: string;
  name: string | null;
  email: string | null;
};

type PendingInvite = {
  id: number;
  email: string;
  token: string;
  status: string;
};

export function MembersList({
  projectId,
  members,
  invites,
  isLoading,
  currentUserRole,
  onChanged,
}: {
  projectId: number;
  members?: ProjectMember[];
  invites?: PendingInvite[];
  isLoading?: boolean;
  currentUserRole?: string;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const removeMember = trpc.team.removeMember.useMutation({
    onSuccess: () => {
      utils.team.listMembers.invalidate({ projectId });
      toast.success("Member removed");
      onChanged?.();
    },
  });

  const revokeInvite = trpc.team.revokeInvite.useMutation({
    onSuccess: () => {
      utils.team.listInvites.invalidate({ projectId });
      toast.success("Invite revoked");
      onChanged?.();
    },
  });

  const copyPendingInviteLink = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
    toast.success("Invite link copied");
  };

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  const pendingInvites = (invites ?? []).filter((i) => i.status === "pending");
  const canManage = canManageProject(currentUserRole, user?.role);
  const canEditRoles = currentUserRole === "owner" || user?.role === "admin";

  return (
    <div className="space-y-4">
      <div className="divide-y">
        {(members ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between py-3 gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{m.name ?? m.email}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canEditRoles && m.role !== "owner" ? (
                <RoleSelect
                  projectId={projectId}
                  userId={m.userId}
                  role={m.role}
                  canEdit
                />
              ) : (
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {m.role}
                </Badge>
              )}
              {canManage && m.role !== "owner" && m.userId !== user?.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeMember.mutate({ projectId, userId: m.userId })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {pendingInvites.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Pending invites</p>
          {pendingInvites.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between py-2 text-sm gap-2">
              <span className="truncate">{inv.email}</span>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => copyPendingInviteLink(inv.token)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => revokeInvite.mutate({ id: inv.id, projectId })}
                  >
                    Revoke
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
