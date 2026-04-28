import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
import {
  CheckCircle2,
  Clock,
  Mail,
  Plus,
  Users,
  UserPlus,
  BarChart3,
  Circle,
  Timer,
} from "lucide-react";
import { toast } from "sonner";

function InviteModal({
  open,
  onClose,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  projects: Array<{ id: number; name: string }>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  const invite = trpc.team.invite.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent successfully");
      setEmail(""); setName(""); setProjectId("");
      onClose();
    },
    onError: () => toast.error("Failed to send invitation"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
        </DialogHeader>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => invite.mutate({ email, name: name || undefined, projectId: parseInt(projectId) })}
            disabled={!email.trim() || !projectId || invite.isPending}
          >
            {invite.isPending ? "Sending..." : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkloadBar({ done, inProgress, inReview, todo, total }: {
  done: number; inProgress: number; inReview: number; todo: number; total: number;
}) {
  if (total === 0) return <div className="h-1.5 w-full bg-muted rounded-full" />;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden flex">
      <div className="bg-emerald-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
      <div className="bg-blue-500 transition-all" style={{ width: `${(inProgress / total) * 100}%` }} />
      <div className="bg-amber-500 transition-all" style={{ width: `${(inReview / total) * 100}%` }} />
      <div className="bg-slate-300 transition-all" style={{ width: `${(todo / total) * 100}%` }} />
    </div>
  );
}

export default function Team() {
  const { user } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const { data: workloads, isLoading } = trpc.team.workload.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();

  const totalMembers = workloads?.length ?? 0;
  const activeMembers = workloads?.filter((w) => w.in_progress > 0).length ?? 0;
  const totalTasks = workloads?.reduce((a, w) => a + w.total, 0) ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {totalMembers} member{totalMembers !== 1 ? "s" : ""} · {totalTasks} tasks assigned
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-3.5 w-3.5" />
          Invite Member
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Members</p>
                <p className="text-xl font-semibold">{totalMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Timer className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Active</p>
                <p className="text-xl font-semibold">{activeMembers}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Tasks</p>
                <p className="text-xl font-semibold">{totalTasks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Workload Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Workload Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : !workloads?.length ? (
            <div className="p-12 flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">No team members yet</p>
                <p className="text-sm text-muted-foreground mt-1">Invite colleagues to start collaborating</p>
              </div>
              <Button size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="mr-2 h-3.5 w-3.5" />
                Invite Member
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {workloads.map((w) => {
                const initials = (w.user.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                const donePercent = w.total > 0 ? Math.round((w.done / w.total) * 100) : 0;
                return (
                  <div key={w.user.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-sm font-medium">{w.user.name ?? `User ${w.user.id}`}</p>
                          <p className="text-xs text-muted-foreground">{w.user.email ?? ""}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-slate-300" />
                            {w.todo} todo
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-blue-500" />
                            {w.in_progress} active
                          </span>
                          <span className="flex items-center gap-1">
                            <div className="h-2 w-2 rounded-full bg-emerald-500" />
                            {w.done} done
                          </span>
                        </div>
                      </div>
                      <WorkloadBar
                        done={w.done}
                        inProgress={w.in_progress}
                        inReview={w.in_review}
                        todo={w.todo}
                        total={w.total}
                      />
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold">{w.total}</p>
                      <p className="text-[10px] text-muted-foreground">{donePercent}% done</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        projects={projects ?? []}
      />
    </div>
  );
}
