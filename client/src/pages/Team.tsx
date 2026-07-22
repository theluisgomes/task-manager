import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  UserPlus,
  BarChart3,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  AddMemberDialog,
  InviteMemberDialog,
  MembersList,
} from "@/components/collaboration";
import { canManageProject } from "@shared/roles";

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
  const [showAddMember, setShowAddMember] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const utils = trpc.useUtils();

  const projectIdNum = selectedProjectId ? parseInt(selectedProjectId) : 0;

  const { data: workloads, isLoading } = trpc.team.workload.useQuery(
    projectIdNum > 0 ? { projectId: projectIdNum } : undefined
  );
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: members, isLoading: membersLoading } = trpc.team.listMembers.useQuery(
    { projectId: projectIdNum },
    { enabled: projectIdNum > 0 }
  );
  const currentUserRole = members?.find((m) => m.userId === user?.id)?.role;
  const canManage = canManageProject(currentUserRole, user?.role);
  const { data: invites } = trpc.team.listInvites.useQuery(
    { projectId: projectIdNum },
    { enabled: projectIdNum > 0 && canManage }
  );

  const totalMembers = projectIdNum > 0 ? (members?.length ?? 0) : 0;
  const activeMembers = workloads?.filter((w) => w.in_progress > 0).length ?? 0;
  const totalTasks = workloads?.reduce((a, w) => a + w.total, 0) ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage collaboration per project
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setShowInvite(true)}
          disabled={!projects?.length}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Invite Member
        </Button>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Select Project
          </CardTitle>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {(projects ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
      </Card>

      {projectIdNum > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Members</p>
                <p className="text-xl font-semibold">{totalMembers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <Timer className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Active</p>
                <p className="text-xl font-semibold">{activeMembers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Tasks</p>
                <p className="text-xl font-semibold">{totalTasks}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Project Members
          </CardTitle>
          {canManage && projectIdNum > 0 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowAddMember(true)}>
                Add Member
              </Button>
              <Button size="sm" className="h-8 text-xs" onClick={() => setShowInvite(true)}>
                Invite
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!selectedProjectId ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Select a project to manage members and invites
            </p>
          ) : (
            <MembersList
              projectId={projectIdNum}
              members={members}
              invites={invites}
              isLoading={membersLoading}
              currentUserRole={currentUserRole}
            />
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Workload Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!selectedProjectId ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Select a project to see workload by member
            </p>
          ) : isLoading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !workloads?.length ? (
            <div className="p-12 flex flex-col items-center text-center gap-3">
              <Users className="h-6 w-6 text-muted-foreground" />
              <p className="font-medium">No assigned tasks in this project</p>
            </div>
          ) : (
            <div className="divide-y">
              {workloads.map((w) => {
                const initials = (w.user.name ?? "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
                const donePercent = w.total > 0 ? Math.round((w.done / w.total) * 100) : 0;
                return (
                  <div key={w.user.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-primary">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{w.user.name ?? `User ${w.user.id}`}</p>
                      <p className="text-xs text-muted-foreground">{w.user.email ?? ""}</p>
                      <WorkloadBar done={w.done} inProgress={w.in_progress} inReview={w.in_review} todo={w.todo} total={w.total} />
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

      <InviteMemberDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        projectId={projectIdNum > 0 ? projectIdNum : undefined}
        projects={projects ?? []}
        onSuccess={() => {
          if (projectIdNum) {
            utils.team.listInvites.invalidate({ projectId: projectIdNum });
            utils.team.listMembers.invalidate({ projectId: projectIdNum });
            utils.team.workload.invalidate({ projectId: projectIdNum });
          }
        }}
      />
      {projectIdNum > 0 && (
        <AddMemberDialog
          open={showAddMember}
          onClose={() => setShowAddMember(false)}
          projectId={projectIdNum}
          onSuccess={() => {
            utils.team.listMembers.invalidate({ projectId: projectIdNum });
            utils.team.workload.invalidate({ projectId: projectIdNum });
          }}
        />
      )}

      {user?.role === "admin" && <AdminPeopleCostSection />}
    </div>
  );
}

function AdminPeopleCostSection() {
  const utils = trpc.useUtils();
  const [costView, setCostView] = useState<"user" | "project">("user");
  const [empUserId, setEmpUserId] = useState("");
  const [empTotal, setEmpTotal] = useState("");
  const [empInstallments, setEmpInstallments] = useState("1");
  const [empHours, setEmpHours] = useState("160");
  const [allocUserId, setAllocUserId] = useState("");
  const [allocProjectId, setAllocProjectId] = useState("");
  const [allocHours, setAllocHours] = useState("");
  const [allocRate, setAllocRate] = useState("");

  const { data: users } = trpc.team.listUsers.useQuery();
  const { data: projects } = trpc.projects.list.useQuery();
  const { data: employment } = trpc.crm.listEmploymentContracts.useQuery();
  const { data: allocations } = trpc.crm.listAllocations.useQuery();
  const { data: breakdown } = trpc.finance.hoursCostBreakdown.useQuery();

  const createEmp = trpc.crm.createEmploymentContract.useMutation({
    onSuccess: () => {
      utils.crm.listEmploymentContracts.invalidate();
      toast.success("Contrato profissional criado");
      setEmpUserId(""); setEmpTotal(""); setEmpInstallments("1"); setEmpHours("160");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteEmp = trpc.crm.deleteEmploymentContract.useMutation({
    onSuccess: () => utils.crm.listEmploymentContracts.invalidate(),
  });
  const createAlloc = trpc.crm.createAllocation.useMutation({
    onSuccess: () => {
      utils.crm.listAllocations.invalidate();
      utils.finance.teamUtilization.invalidate();
      toast.success("Alocação criada");
      setAllocUserId(""); setAllocProjectId(""); setAllocHours(""); setAllocRate("");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteAlloc = trpc.crm.deleteAllocation.useMutation({
    onSuccess: () => {
      utils.crm.listAllocations.invalidate();
      utils.finance.teamUtilization.invalidate();
    },
  });

  return (
    <div className="space-y-4 pt-4 border-t">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Contratos e custo HH (admin)
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Contratos profissionais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={empUserId} onValueChange={setEmpUserId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Profissional" /></SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email ?? `User ${u.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="h-8 text-xs" placeholder="Valor global" type="number" value={empTotal} onChange={(e) => setEmpTotal(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Parcelas" type="number" value={empInstallments} onChange={(e) => setEmpInstallments(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Horas/mês" type="number" value={empHours} onChange={(e) => setEmpHours(e.target.value)} />
            </div>
            <Button size="sm" className="h-8 text-xs" disabled={createEmp.isPending || !empUserId || !empTotal || !empHours}
              onClick={() => createEmp.mutate({
                userId: parseInt(empUserId),
                totalValue: parseFloat(empTotal),
                installments: parseInt(empInstallments) || 1,
                availableHoursPerMonth: parseFloat(empHours),
              })}>
              Adicionar contrato
            </Button>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(employment ?? []).map((e) => (
                <div key={e.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5">
                  <span>{e.userName ?? e.userId} · R$ {e.totalValue} · {e.availableHoursPerMonth}h/mês · rate {e.hourlyRate ?? "—"}</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => deleteEmp.mutate({ id: e.id })}>Remover</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Alocações por projeto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Select value={allocUserId} onValueChange={setAllocUserId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Usuário" /></SelectTrigger>
                <SelectContent>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>{u.name ?? u.email ?? `User ${u.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={allocProjectId} onValueChange={setAllocProjectId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Projeto" /></SelectTrigger>
                <SelectContent>
                  {(projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input className="h-8 text-xs" placeholder="Horas disponíveis" type="number" value={allocHours} onChange={(e) => setAllocHours(e.target.value)} />
              <Input className="h-8 text-xs" placeholder="Rate/hora" type="number" value={allocRate} onChange={(e) => setAllocRate(e.target.value)} />
            </div>
            <Button size="sm" className="h-8 text-xs" disabled={createAlloc.isPending || !allocUserId || !allocProjectId || !allocHours}
              onClick={() => createAlloc.mutate({
                userId: parseInt(allocUserId),
                projectId: parseInt(allocProjectId),
                availableHours: parseFloat(allocHours),
                hourlyRate: allocRate ? parseFloat(allocRate) : undefined,
              })}>
              Adicionar alocação
            </Button>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(allocations ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-xs border rounded-md px-2 py-1.5">
                  <span>{a.userName} · {a.projectName} · {a.availableHours}h</span>
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive"
                    onClick={() => deleteAlloc.mutate({ id: a.id, projectId: a.projectId })}>Remover</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Custo HH (horas × rate)</CardTitle>
          <div className="flex border rounded-lg overflow-hidden">
            <button type="button" className={`px-2 py-1 text-xs ${costView === "user" ? "bg-secondary" : ""}`} onClick={() => setCostView("user")}>Por usuário</button>
            <button type="button" className={`px-2 py-1 text-xs ${costView === "project" ? "bg-secondary" : ""}`} onClick={() => setCostView("project")}>Por projeto</button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {(costView === "user" ? breakdown?.byUser : breakdown?.byProject)?.map((row: any) => (
              <div key={costView === "user" ? row.userId : row.projectId} className="flex justify-between text-sm border-b py-1.5">
                <span>{costView === "user" ? (row.userName ?? row.userId) : (row.projectName ?? row.projectId)}</span>
                <span className="text-muted-foreground">{row.hours.toFixed(1)}h · R$ {row.cost.toFixed(2)}</span>
              </div>
            )) ?? <p className="text-xs text-muted-foreground">Sem dados de timesheet</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
