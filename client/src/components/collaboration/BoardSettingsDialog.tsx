import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { BoardAccessPanel } from "./BoardAccessPanel";

export function BoardSettingsDialog({
  open,
  onClose,
  boardId,
  projectId,
  name,
  description,
  accessMode,
  canManage,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  boardId: number;
  projectId: number;
  name: string;
  description: string | null;
  accessMode: "project" | "restricted";
  canManage: boolean;
  onDeleted: () => void;
}) {
  const [boardName, setBoardName] = useState(name);
  const [boardDescription, setBoardDescription] = useState(description ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (open) {
      setBoardName(name);
      setBoardDescription(description ?? "");
    }
  }, [open, name, description]);

  const updateBoard = trpc.boards.update.useMutation({
    onSuccess: () => {
      utils.boards.byId.invalidate({ id: boardId });
      utils.boards.byProject.invalidate({ projectId });
      toast.success("Board atualizado");
    },
    onError: (err) => toast.error(err.message || "Falha ao atualizar o board"),
  });

  const deleteBoard = trpc.boards.delete.useMutation({
    onSuccess: () => {
      utils.boards.byProject.invalidate({ projectId });
      toast.success("Board excluído");
      setConfirmDelete(false);
      onClose();
      onDeleted();
    },
    onError: (err) => toast.error(err.message || "Falha ao excluir o board"),
  });

  const handleSaveGeneral = () => {
    const trimmed = boardName.trim();
    if (!trimmed) {
      toast.error("O nome do board é obrigatório");
      return;
    }
    const nextDescription = boardDescription.trim();
    const nameChanged = trimmed !== name;
    const descriptionChanged = nextDescription !== (description ?? "").trim();
    if (!nameChanged && !descriptionChanged) {
      toast.message("Nenhuma alteração para salvar");
      return;
    }
    updateBoard.mutate({
      id: boardId,
      ...(nameChanged ? { name: trimmed } : {}),
      ...(descriptionChanged ? { description: nextDescription } : {}),
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do board</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Geral</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Nome e descrição visíveis para quem acessa o board.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-settings-name">Nome</Label>
                <Input
                  id="board-settings-name"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  disabled={!canManage || updateBoard.isPending}
                  placeholder="Nome do board"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="board-settings-description">Descrição</Label>
                <Textarea
                  id="board-settings-description"
                  value={boardDescription}
                  onChange={(e) => setBoardDescription(e.target.value)}
                  disabled={!canManage || updateBoard.isPending}
                  placeholder="Opcional"
                  rows={3}
                />
              </div>
              {canManage && (
                <Button
                  size="sm"
                  onClick={handleSaveGeneral}
                  disabled={updateBoard.isPending}
                >
                  {updateBoard.isPending ? "Salvando..." : "Salvar"}
                </Button>
              )}
            </section>

            <Separator />

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-medium">Acesso</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Controle quem vê e edita este board.
                </p>
              </div>
              <BoardAccessPanel
                boardId={boardId}
                projectId={projectId}
                accessMode={accessMode}
                canManage={canManage}
              />
            </section>

            {canManage && (
              <>
                <Separator />
                <section className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium text-destructive">Zona de perigo</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Excluir remove o board, colunas e tasks. Esta ação não pode ser desfeita.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteBoard.isPending}
                  >
                    Excluir board
                  </Button>
                </section>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as colunas e tasks deste board serão removidas permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBoard.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBoard.isPending}
              onClick={(e) => {
                e.preventDefault();
                deleteBoard.mutate({ id: boardId });
              }}
            >
              {deleteBoard.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
