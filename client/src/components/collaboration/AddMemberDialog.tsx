import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function AddMemberDialog({
  open,
  onClose,
  projectId,
  boardId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId: number;
  boardId?: number;
  onSuccess?: () => void;
}) {
  const [userId, setUserId] = useState<string>("");
  const utils = trpc.useUtils();

  const { data: collaborators } = trpc.team.listCollaborators.useQuery(
    { projectId },
    { enabled: open && !boardId }
  );

  const { data: projectMembers } = trpc.team.listMembers.useQuery(
    { projectId },
    { enabled: open && !!boardId }
  );

  const { data: boardMembers } = trpc.boards.listMembers.useQuery(
    { boardId: boardId! },
    { enabled: open && !!boardId }
  );

  const boardMemberIds = useMemo(
    () => new Set((boardMembers ?? []).map((m) => m.userId)),
    [boardMembers]
  );

  const availableForBoard = useMemo(
    () => (projectMembers ?? []).filter((m) => !boardMemberIds.has(m.userId)),
    [projectMembers, boardMemberIds]
  );

  const addToProject = trpc.team.addMember.useMutation({
    onSuccess: () => {
      utils.team.listMembers.invalidate({ projectId });
      utils.team.listCollaborators.invalidate({ projectId });
      toast.success("Member added");
      setUserId("");
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to add member"),
  });

  const addToBoard = trpc.boards.addMember.useMutation({
    onSuccess: () => {
      utils.boards.listMembers.invalidate({ boardId: boardId! });
      toast.success("Member added to board");
      setUserId("");
      onSuccess?.();
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to add member to board"),
  });

  const handleClose = () => {
    setUserId("");
    onClose();
  };

  const handleAdd = () => {
    if (!userId) return;
    const parsedUserId = parseInt(userId);
    if (boardId) {
      addToBoard.mutate({ boardId, userId: parsedUserId });
    } else {
      addToProject.mutate({ projectId, userId: parsedUserId });
    }
  };

  const options = boardId
    ? availableForBoard.map((m) => ({
        id: m.userId,
        label: m.name ?? m.email ?? `User ${m.userId}`,
      }))
    : (collaborators ?? []).map((c) => ({
        id: c.id,
        label: c.name ?? c.email ?? `User ${c.id}`,
      }));

  const isPending = addToProject.isPending || addToBoard.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {boardId ? "Add Member to Board" : "Add Existing Member"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{boardId ? "Project member" : "Colleague"}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Select someone" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id.toString()}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!options.length && (
              <p className="text-xs text-muted-foreground">
                {boardId
                  ? "All project members already have access to this board."
                  : "No colleagues available. Invite someone by email first."}
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!userId || isPending}>
            {isPending ? "Adding..." : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
