import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { BoardMembersList } from "./BoardMembersList";
import { AddMemberDialog } from "./AddMemberDialog";
import { InviteMemberDialog } from "./InviteMemberDialog";

export function BoardAccessPanel({
  boardId,
  projectId,
  accessMode,
  canManage,
}: {
  boardId: number;
  projectId: number;
  accessMode: "project" | "restricted";
  canManage: boolean;
}) {
  const [mode, setMode] = useState(accessMode);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    setMode(accessMode);
  }, [accessMode]);

  const updateAccess = trpc.boards.updateAccess.useMutation({
    onSuccess: () => {
      utils.boards.byId.invalidate({ id: boardId });
      utils.boards.byProject.invalidate({ projectId });
      toast.success("Acesso do board atualizado");
    },
    onError: (err) => toast.error(err.message || "Falha ao atualizar acesso"),
  });

  const handleModeChange = (value: "project" | "restricted") => {
    setMode(value);
    updateAccess.mutate({ boardId, accessMode: value });
  };

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Quem pode acessar este board</Label>
          <Select
            value={mode}
            onValueChange={(v) => handleModeChange(v as "project" | "restricted")}
            disabled={!canManage || updateAccess.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="project">Todos os membros do projeto</SelectItem>
              <SelectItem value="restricted">Restrito — só membros selecionados</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {mode === "project"
              ? "Todos os membros do projeto podem ver e editar este board."
              : "Somente membros adicionados e admins do projeto podem acessar."}
          </p>
        </div>

        {mode === "restricted" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Membros do board</Label>
              {canManage && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowAddMember(true)}
                  >
                    Adicionar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowInvite(true)}
                  >
                    Convidar
                  </Button>
                </div>
              )}
            </div>
            <BoardMembersList boardId={boardId} canManage={canManage} />
          </div>
        )}
      </div>

      <AddMemberDialog
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        projectId={projectId}
        boardId={boardId}
        onSuccess={() => utils.boards.listMembers.invalidate({ boardId })}
      />
      <InviteMemberDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        projectId={projectId}
        boardId={boardId}
        onSuccess={() => {
          utils.team.listInvites.invalidate({ projectId });
          utils.boards.listMembers.invalidate({ boardId });
        }}
      />
    </>
  );
}
