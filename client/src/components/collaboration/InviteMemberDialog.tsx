import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export function InviteMemberDialog({
  open,
  onClose,
  projectId: fixedProjectId,
  boardId,
  projects,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: number;
  boardId?: number;
  projects?: Array<{ id: number; name: string }>;
  onSuccess?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string>(fixedProjectId?.toString() ?? "");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open && fixedProjectId) {
      setProjectId(fixedProjectId.toString());
    }
  }, [open, fixedProjectId]);

  const copyInviteLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const invite = trpc.team.invite.useMutation({
    onSuccess: (data) => {
      onSuccess?.();
      if (data.emailSent) {
        toast.success("Invitation email sent");
        setEmail("");
        setName("");
        if (!fixedProjectId) setProjectId("");
        setInviteUrl(null);
        onClose();
      } else {
        setInviteUrl(data.inviteUrl);
        toast.warning("Invite created, but email could not be sent. Copy the link below.");
      }
    },
    onError: (err) => toast.error(err.message || "Failed to create invitation"),
  });

  const handleClose = () => {
    setEmail("");
    setName("");
    if (!fixedProjectId) setProjectId("");
    setInviteUrl(null);
    onClose();
  };

  const resolvedProjectId = fixedProjectId ?? (projectId ? parseInt(projectId) : 0);

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
            {!fixedProjectId && projects && (
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
                onClick={() =>
                  invite.mutate({
                    email,
                    name: name || undefined,
                    projectId: resolvedProjectId,
                    boardId,
                  })
                }
                disabled={!email.trim() || !resolvedProjectId || invite.isPending}
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
