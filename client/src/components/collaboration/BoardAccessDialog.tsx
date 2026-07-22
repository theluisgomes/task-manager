import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BoardAccessPanel } from "./BoardAccessPanel";

/** Thin wrapper kept for compatibility; prefer BoardSettingsDialog for full config. */
export function BoardAccessDialog({
  open,
  onClose,
  boardId,
  projectId,
  accessMode,
  canManage,
}: {
  open: boolean;
  onClose: () => void;
  boardId: number;
  projectId: number;
  accessMode: "project" | "restricted";
  canManage: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acesso do board</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <BoardAccessPanel
            boardId={boardId}
            projectId={projectId}
            accessMode={accessMode}
            canManage={canManage}
          />
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Concluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
