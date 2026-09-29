import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PROJECT_AREAS, type ProjectArea } from "@shared/projectAreas";

export function InviteMemberDialog({
  open,
  onClose,
  projectId: fixedProjectId,
  boardId,
  projects,
  allowBulk,
  initialProjectIds,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: number;
  boardId?: number;
  projects?: Array<{ id: number; name: string }>;
  allowBulk?: boolean;
  initialProjectIds?: number[];
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string>(fixedProjectId?.toString() ?? "");
  const [mode, setMode] = useState<"projects" | "area">("projects");
  const [selectedIds, setSelectedIds] = useState<number[]>(initialProjectIds ?? []);
  const [area, setArea] = useState<ProjectArea>("clientes");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const initialKey = (initialProjectIds ?? []).join(",");

  useEffect(() => {
    if (!open) return;
    if (fixedProjectId) setProjectId(fixedProjectId.toString());
    setSelectedIds(initialKey ? initialKey.split(",").map(Number) : []);
    setMode("projects");
  }, [open, fixedProjectId, initialKey]);

  const copyInviteLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const invite = trpc.team.invite.useMutation({
    onSuccess: (data) => {
      onSuccess?.();
      if (data.emailSent) {
        toast.success("Invitation email sent");
        reset();
        onClose();
      } else {
        setInviteUrl(data.inviteUrl);
        toast.warning("Invite created, but email could not be sent. Copy the link below.");
      }
    },
    onError: (err) => toast.error(err.message || "Failed to create invitation"),
  });

  const reset = () => {
    setEmail("");
    setName("");
    if (!fixedProjectId) setProjectId("");
    setSelectedIds(initialProjectIds ?? []);
    setMode("projects");
    setInviteUrl(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const resolvedProjectId = fixedProjectId ?? (projectId ? parseInt(projectId) : 0);
  const toggleProject = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };

  const canSend = !!email.trim() && !invite.isPending && (
    fixedProjectId
      ? true
      : allowBulk
        ? (mode === "area" || selectedIds.length > 0)
        : !!resolvedProjectId
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Share this link with <strong>{email}</strong> so they can join
              {boardId ? " the board" : " the project"}.
            </p>
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} className="text-xs" />
              <Button type="button" variant="outline" onClick={() => copyInviteLink(inviteUrl)}>
                Copy
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Email Address *</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Full name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {!fixedProjectId && allowBulk && (
              <div className="space-y-3">
                <div className="flex border rounded-lg overflow-hidden w-fit" role="group" aria-label="Modo de convite">
                  <button type="button" className={`px-3 py-1.5 text-xs ${mode === "projects" ? "bg-secondary font-medium" : ""}`} onClick={() => setMode("projects")}>
                    Projetos
                  </button>
                  <button type="button" className={`px-3 py-1.5 text-xs ${mode === "area" ? "bg-secondary font-medium" : ""}`} onClick={() => setMode("area")}>
                    Área
                  </button>
                </div>
                {mode === "projects" ? (
                  <div className="max-h-40 overflow-y-auto space-y-2 rounded-md border p-2">
                    {projects?.length ? projects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={selectedIds.includes(project.id)}
                          onCheckedChange={() => toggleProject(project.id)}
                        />
                        <span className="truncate">{project.name}</span>
                      </label>
                    )) : (
                      <p className="text-xs text-muted-foreground">Nenhum projeto disponível</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>Área</Label>
                    <Select value={area} onValueChange={(value) => setArea(value as ProjectArea)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PROJECT_AREAS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Inclui os projetos ativos dessa área em que você é admin.
                    </p>
                  </div>
                )}
              </div>
            )}
            {!fixedProjectId && !allowBulk && projects && (
              <div className="space-y-1.5">
                <Label>Project *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {inviteUrl ? (
            <Button onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (fixedProjectId || !allowBulk) {
                    invite.mutate({
                      email,
                      name: name || undefined,
                      projectId: resolvedProjectId,
                      boardId,
                    });
                    return;
                  }
                  if (mode === "area") {
                    invite.mutate({ email, name: name || undefined, area });
                    return;
                  }
                  invite.mutate({ email, name: name || undefined, projectIds: selectedIds });
                }}
                disabled={!canSend}
              >
                {invite.isPending ? "Sending..." : "Send Invite"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
