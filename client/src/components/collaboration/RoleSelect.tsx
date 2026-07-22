import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function RoleSelect({
  projectId,
  userId,
  role,
  canEdit,
}: {
  projectId: number;
  userId: number;
  role: string;
  canEdit: boolean;
}) {
  const utils = trpc.useUtils();
  const updateRole = trpc.team.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.team.listMembers.invalidate({ projectId });
      toast.success("Role updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update role"),
  });

  if (!canEdit || role === "owner") {
    return <span className="text-xs capitalize text-muted-foreground">{role}</span>;
  }

  return (
    <Select
      value={role}
      onValueChange={(value) =>
        updateRole.mutate({ projectId, userId, role: value as "admin" | "member" })
      }
      disabled={updateRole.isPending}
    >
      <SelectTrigger className="h-7 w-24 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin</SelectItem>
        <SelectItem value="member">Member</SelectItem>
      </SelectContent>
    </Select>
  );
}
