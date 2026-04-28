import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight,
  FolderKanban,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  Trash2,
  Edit3,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

const PROJECT_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#0ea5e9", "#3b82f6",
];

function CreateProjectModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  const create = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.dashboard.recentProjects.invalidate();
      toast.success("Project created");
      setName(""); setDescription(""); setColor(PROJECT_COLORS[0]);
      onClose();
    },
    onError: () => toast.error("Failed to create project"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="proj-name">Project Name</Label>
            <Input
              id="proj-name"
              placeholder="e.g. Q4 Marketing Campaign"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate({ name, description, color })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="proj-desc">Description</Label>
            <Textarea
              id="proj-desc"
              placeholder="Brief description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-7 w-7 rounded-lg transition-transform hover:scale-110 ${color === c ? "ring-2 ring-offset-2 ring-foreground scale-110" : ""}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate({ name, description, color })}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({
  project,
  onSelect,
}: {
  project: { id: number; name: string; description: string | null; color: string | null; status: string; createdAt: Date };
  onSelect: () => void;
}) {
  const utils = trpc.useUtils();
  const deleteProject = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Project deleted"); },
    onError: () => toast.error("Failed to delete project"),
  });
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); toast.success("Project updated"); },
  });

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={onSelect}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0"
            style={{ background: project.color ?? "#6366f1" }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => updateProject.mutate({ id: project.id, status: "completed" })}>
                <Edit3 className="mr-2 h-3.5 w-3.5" />
                Mark Complete
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => updateProject.mutate({ id: project.id, status: "archived" })}>
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => deleteProject.mutate({ id: project.id })}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h3 className="font-semibold text-sm group-hover:text-primary transition-colors truncate">{project.name}</h3>
        {project.description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
        )}
        <div className="flex items-center justify-between mt-4">
          <Badge
            variant="secondary"
            className={`text-[10px] h-4 px-1.5 ${
              project.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
              project.status === "completed" ? "bg-blue-50 text-blue-700 border-blue-200" :
              "bg-slate-100 text-slate-600"
            }`}
          >
            {project.status}
          </Badge>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectDetail({ projectId }: { projectId: number }) {
  const [, setLocation] = useLocation();
  const { data: project } = trpc.projects.byId.useQuery({ id: projectId });
  const { data: boards, isLoading } = trpc.boards.byProject.useQuery({ projectId });
  const utils = trpc.useUtils();
  const createBoard = trpc.boards.create.useMutation({
    onSuccess: (boardId) => {
      utils.boards.byProject.invalidate({ projectId });
      toast.success("Board created");
      setLocation(`/projects/${projectId}/board/${boardId}`);
    },
    onError: () => toast.error("Failed to create board"),
  });

  if (!project) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocation("/projects")}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          Projects
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{project.name}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-semibold"
            style={{ background: project.color ?? "#6366f1" }}
          >
            {project.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => createBoard.mutate({ projectId, name: "Main Board" })}
          disabled={createBoard.isPending}
        >
          <Plus className="h-3.5 w-3.5" />
          New Board
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !boards?.length ? (
        <Card className="border-0 shadow-sm border-dashed border-2 border-border">
          <CardContent className="p-12 flex flex-col items-center text-center gap-4">
            <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
              <Layers className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">No boards yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Create your first board to start managing tasks
              </p>
            </div>
            <Button
              onClick={() => createBoard.mutate({ projectId, name: "Main Board" })}
              disabled={createBoard.isPending}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board) => (
            <Card
              key={board.id}
              className="border-0 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group"
              onClick={() => setLocation(`/projects/${projectId}/board/${board.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{board.name}</p>
                    {board.description && (
                      <p className="text-xs text-muted-foreground truncate">{board.description}</p>
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
  );
}

export default function Projects() {
  const params = useParams<{ projectId?: string }>();
  const projectId = params.projectId ? parseInt(params.projectId) : null;
  const [, setLocation] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  if (projectId) {
    return <ProjectDetail projectId={projectId} />;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              className={`p-2 transition-colors ${view === "grid" ? "bg-secondary" : "hover:bg-muted"}`}
              onClick={() => setView("grid")}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </button>
            <button
              className={`p-2 transition-colors ${view === "list" ? "bg-secondary" : "hover:bg-muted"}`}
              onClick={() => setView("list")}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="p-5">
                <Skeleton className="h-10 w-10 rounded-xl mb-3" />
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-3 w-48" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !projects?.length ? (
        <Card className="border-0 shadow-sm border-dashed border-2 border-border">
          <CardContent className="p-16 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <FolderKanban className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-lg">No projects yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Projects help you organize work into boards and track progress across your team.
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={() => setLocation(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
