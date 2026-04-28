import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  Layers,
  LayoutDashboard,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format, isToday, isTomorrow, differenceInDays } from "date-fns";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold mt-1.5 tracking-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  return <span className={`priority-${priority}`}>{priority}</span>;
}

function DueDateLabel({ dueDate }: { dueDate: Date | null }) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const diff = differenceInDays(d, new Date());
  let label = format(d, "MMM d");
  let cls = "text-muted-foreground";
  if (isToday(d)) { label = "Today"; cls = "text-orange-600 font-medium"; }
  else if (isTomorrow(d)) { label = "Tomorrow"; cls = "text-amber-600"; }
  else if (diff < 0) { label = `${Math.abs(diff)}d overdue`; cls = "text-red-600 font-medium"; }
  else if (diff <= 3) cls = "text-amber-600";
  return (
    <span className={`flex items-center gap-1 text-xs ${cls}`}>
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: stats, isLoading: statsLoading } = trpc.dashboard.stats.useQuery();
  const { data: projects, isLoading: projectsLoading } = trpc.dashboard.recentProjects.useQuery();
  const { data: upcoming, isLoading: upcomingLoading } = trpc.dashboard.upcomingTasks.useQuery({ days: 7 });

  const taskCounts = stats?.taskCounts as Record<string, number> | undefined;
  const totalTasks = Object.values(taskCounts ?? {}).reduce((a, b) => a + b, 0);
  const doneTasks = taskCounts?.done ?? 0;
  const inProgressTasks = taskCounts?.in_progress ?? 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {user?.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Here's what's happening across your projects today.
          </p>
        </div>
        <Button
          onClick={() => setLocation("/projects")}
          size="sm"
          variant="outline"
          className="gap-1.5"
        >
          <FolderKanban className="h-3.5 w-3.5" />
          View Projects
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-7 w-12" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              icon={FolderKanban}
              label="Total Projects"
              value={stats?.totalProjects ?? 0}
              sub="Active workspaces"
              color="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Layers}
              label="Total Tasks"
              value={totalTasks}
              sub={`${doneTasks} completed`}
              color="bg-blue-50 text-blue-600"
            />
            <StatCard
              icon={Timer}
              label="In Progress"
              value={inProgressTasks}
              sub="Active tasks"
              color="bg-amber-50 text-amber-600"
            />
            <StatCard
              icon={CheckCircle2}
              label="Completed"
              value={doneTasks}
              sub={totalTasks > 0 ? `${Math.round((doneTasks / totalTasks) * 100)}% done` : "0% done"}
              color="bg-emerald-50 text-emerald-600"
            />
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Projects */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Projects
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setLocation("/projects")}
            >
              View all <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          {projectsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-40 mb-2" />
                    <Skeleton className="h-3 w-64" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !projects?.length ? (
            <Card className="border-0 shadow-sm border-dashed border-2 border-border">
              <CardContent className="p-8 flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <FolderKanban className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium text-sm">No projects yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your first project to get started
                  </p>
                </div>
                <Button size="sm" onClick={() => setLocation("/projects")}>
                  Create Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 5).map((project) => (
                <Card
                  key={project.id}
                  className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
                  onClick={() => setLocation(`/projects/${project.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-semibold"
                        style={{ background: project.color ?? "#6366f1" }}
                      >
                        {project.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                            {project.name}
                          </p>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] h-4 px-1.5 shrink-0 ${
                              project.status === "active"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : project.status === "completed"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {project.status}
                          </Badge>
                        </div>
                        {project.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {project.description}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming Tasks */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Upcoming Deadlines
            </h2>
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {upcomingLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="p-3">
                    <Skeleton className="h-3.5 w-full mb-2" />
                    <Skeleton className="h-3 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !upcoming?.length ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-6 flex flex-col items-center text-center gap-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground">No upcoming deadlines in the next 7 days.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcoming.map((task) => (
                <Card
                  key={task.id}
                  className="border-0 shadow-sm hover:shadow-md transition-all duration-200"
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <Circle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <DueDateLabel dueDate={task.dueDate} />
                          <PriorityBadge priority={task.priority} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/projects")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Manage Boards</p>
              <p className="text-xs text-muted-foreground">View all project boards</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/team")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <FolderKanban className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Team Workload</p>
              <p className="text-xs text-muted-foreground">View member assignments</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
          onClick={() => setLocation("/finance")}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-sm group-hover:text-primary transition-colors">Finance KPI</p>
              <p className="text-xs text-muted-foreground">Revenue & projections</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
