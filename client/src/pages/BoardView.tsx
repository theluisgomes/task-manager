import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";
import {
  Calendar,
  CheckCircle2,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
  X,
  Edit3,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Download,
  Lock,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";
import { inferStatusFromColumnName, inferStatusFromColumnPosition } from "@shared/kanban";
import { parseTags, serializeTags } from "@shared/tags";
import { canManageProject } from "@shared/roles";
import { BoardSettingsDialog } from "@/components/collaboration";

type Task = {
  id: number;
  columnId: number;
  boardId: number;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high" | "urgent";
  status: "todo" | "in_progress" | "in_review" | "done";
  assigneeId: number | null;
  dueDate: Date | null;
  position: number;
  tags: string | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
};

type Column = {
  id: number;
  boardId: number;
  name: string;
  color: string | null;
  position: number;
  createdAt: Date;
};

function isDoneColumn(name: string): boolean {
  return inferStatusFromColumnName(name) === "done" || /\b(conclu|finaliz)/i.test(name);
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  users,
  columns,
  onEdit,
  onDelete,
  onMoveToColumn,
  isDragging,
  isBlocked,
  assigneeIds,
}: {
  task: Task;
  users: Array<{ id: number; name: string | null }>;
  columns: Column[];
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  onMoveToColumn: (taskId: number, columnId: number) => void;
  isDragging?: boolean;
  isBlocked?: boolean;
  assigneeIds?: number[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({
    id: `task-${task.id}`,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  const assignee = users.find((u) => u.id === task.assigneeId);
  const multiAssignees = (assigneeIds?.length
    ? users.filter((u) => assigneeIds.includes(u.id))
    : assignee
      ? [assignee]
      : []);
  const taskTags = useMemo(() => parseTags(task.tags), [task.tags]);
  const dueDate = task.dueDate ? new Date(task.dueDate) : null;
  const isOverdue = dueDate && differenceInDays(dueDate, new Date()) < 0;
  const isDueSoon = dueDate && differenceInDays(dueDate, new Date()) <= 2 && !isOverdue;

  const dueDateLabel = dueDate
    ? isToday(dueDate) ? "Today"
    : isTomorrow(dueDate) ? "Tomorrow"
    : format(dueDate, "MMM d")
    : null;

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "drag-overlay" : ""}>
      <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-150 group bg-card">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div
              {...attributes}
              {...listeners}
              title="Drag to move"
              className="mt-0.5 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p
                  className="text-sm font-medium leading-snug cursor-pointer hover:text-primary transition-colors line-clamp-2"
                  onClick={() => onEdit(task)}
                >
                  {task.title}
                </p>
                {isBlocked && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-amber-500 text-amber-700" title="Blocked by incomplete dependencies">
                    <AlertCircle className="h-2.5 w-2.5 mr-0.5" />Blocked
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(task)}>
                      <Edit3 className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    {columns.length > 1 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <GripVertical className="mr-2 h-3.5 w-3.5" />
                          Move to column…
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {columns
                            .filter((c) => c.id !== task.columnId)
                            .map((c) => (
                              <DropdownMenuItem
                                key={c.id}
                                onClick={() => onMoveToColumn(task.id, c.id)}
                              >
                                {c.name}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => onDelete(task.id)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {task.description && (
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
              )}

              {taskTags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {taskTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-2.5 gap-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className={`priority-${task.priority}`}>{task.priority}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {dueDateLabel && (
                    <span
                      className={`flex items-center gap-0.5 text-[10px] ${
                        isOverdue ? "text-red-600 font-medium" :
                        isDueSoon ? "text-amber-600" :
                        "text-muted-foreground"
                      }`}
                    >
                      {isOverdue && <AlertCircle className="h-2.5 w-2.5" />}
                      <Calendar className="h-2.5 w-2.5" />
                      {dueDateLabel}
                    </span>
                  )}
                  {multiAssignees.length > 0 && (
                    <div className="flex -space-x-1.5">
                      {multiAssignees.slice(0, 3).map((u) => (
                        <div
                          key={u.id}
                          className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center ring-1 ring-background"
                          title={u.name ?? ""}
                        >
                          <span className="text-[9px] font-semibold text-primary">
                            {(u.name ?? "?").charAt(0).toUpperCase()}
                          </span>
                        </div>
                      ))}
                      {multiAssignees.length > 3 && (
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center ring-1 ring-background text-[9px]">
                          +{multiAssignees.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Column Component ─────────────────────────────────────────────────────────
function BoardColumn({
  column,
  tasks,
  users,
  columns,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onDeleteColumn,
  onRenameColumn,
  onMoveToColumn,
  isDragging: isBoardDragging,
  isMobile,
  columnRef,
  blockedIds,
  assigneesByTask,
}: {
  column: Column;
  tasks: Task[];
  users: Array<{ id: number; name: string | null }>;
  columns: Column[];
  onAddTask: (columnId: number) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: number) => void;
  onDeleteColumn: (id: number) => void;
  onRenameColumn: (id: number, name: string) => void;
  onMoveToColumn: (taskId: number, columnId: number) => void;
  isDragging?: boolean;
  isMobile?: boolean;
  columnRef?: (el: HTMLDivElement | null) => void;
  blockedIds?: Set<number>;
  assigneesByTask?: Record<number, number[]>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(column.name);

  const isDone = isDoneColumn(column.name);
  const columnColor = column.color ?? "#e2e8f0";

  const { setNodeRef, isOver } = useSortable({
    id: `col-${column.id}`,
    data: { type: "column", column },
  });

  const taskIds = tasks.map((t) => `task-${t.id}`);

  const handleRename = () => {
    if (newName.trim() && newName !== column.name) {
      onRenameColumn(column.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const taskAreaClass = [
    "flex-1 space-y-2 min-h-[120px] overflow-y-auto rounded-xl p-1 -m-1 transition-all duration-150",
    isBoardDragging && isOver && isDone && "column-drop-done",
    isBoardDragging && isOver && !isDone && "column-drop-active",
    isBoardDragging && !isOver && "column-drop-zone",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        columnRef?.(el);
      }}
      className={cn(
        "group flex flex-col shrink-0",
        isMobile ? "w-[calc(100vw-3rem)] snap-center snap-always" : "w-72 h-full max-h-full"
      )}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: columnColor }}
          />
          {isDone && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          )}
          {isRenaming ? (
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") { setIsRenaming(false); setNewName(column.name); }
              }}
              className="h-6 text-xs px-1.5 py-0 w-32"
              autoFocus
            />
          ) : (
            <span
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
              onDoubleClick={() => setIsRenaming(true)}
            >
              {column.name}
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-muted text-muted-foreground">
            {tasks.length}
          </Badge>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setIsRenaming(true)}>
              <Edit3 className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDeleteColumn(column.id)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete Column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Add Task */}
      <Button
        variant="outline"
        size="sm"
        className="mb-3 w-full justify-center gap-2 border-dashed h-9 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-colors"
        style={{ borderColor: `${columnColor}66` }}
        onClick={() => onAddTask(column.id)}
      >
        <Plus className="h-4 w-4" />
        Add task
      </Button>

      {/* Tasks */}
      <div className={taskAreaClass}>
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              users={users}
              columns={columns}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
              onMoveToColumn={onMoveToColumn}
              isBlocked={blockedIds?.has(task.id)}
              assigneeIds={assigneesByTask?.[task.id]}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <Empty
            className="min-h-[100px] border-2 border-dashed rounded-xl py-6 cursor-pointer hover:border-primary/40 hover:bg-accent/30 transition-colors"
            onClick={() => onAddTask(column.id)}
          >
            <EmptyMedia variant="icon">
              {isDone ? <CheckCircle2 className="text-emerald-500/70" /> : <Plus />}
            </EmptyMedia>
            <EmptyContent>
              <EmptyTitle className="text-sm">
                {isDone ? "Drop completed tasks here" : "Add your first task"}
              </EmptyTitle>
              {!isDone && (
                <EmptyDescription>Click to create a task in this column.</EmptyDescription>
              )}
            </EmptyContent>
          </Empty>
        )}
      </div>
    </div>
  );
}

// ─── Task Dependencies ────────────────────────────────────────────────────────
function TaskDependenciesSection({ taskId, boardId, allTasks }: { taskId: number; boardId: number; allTasks: Task[] }) {
  const utils = trpc.useUtils();
  const { data: deps } = trpc.tasks.listDependencies.useQuery({ taskId });
  const [dependsOnId, setDependsOnId] = useState("");
  const addDep = trpc.tasks.addDependency.useMutation({
    onSuccess: () => {
      utils.tasks.listDependencies.invalidate({ taskId });
      utils.tasks.blockedIds.invalidate({ boardId });
      setDependsOnId("");
      toast.success("Dependency added");
    },
    onError: (err) => toast.error(err.message),
  });
  const removeDep = trpc.tasks.removeDependency.useMutation({
    onSuccess: () => {
      utils.tasks.listDependencies.invalidate({ taskId });
      utils.tasks.blockedIds.invalidate({ boardId });
    },
  });
  const candidates = allTasks.filter((t) => t.id !== taskId && !deps?.some((d) => d.dependsOnTaskId === t.id));

  return (
    <div className="space-y-2 border-t pt-3">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">Depende de</Label>
      {deps?.map((d) => (
        <div key={d.id} className="flex items-center justify-between text-sm gap-2">
          <span className={d.blockerStatus === "done" ? "line-through text-muted-foreground" : ""}>{d.blockerTitle}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeDep.mutate({ id: d.id, taskId })}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Select value={dependsOnId || "none"} onValueChange={(v) => setDependsOnId(v === "none" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Add dependency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Select task…</SelectItem>
            {candidates.map((t) => (
              <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8" disabled={!dependsOnId || addDep.isPending}
          onClick={() => addDep.mutate({ taskId, dependsOnTaskId: parseInt(dependsOnId) })}>Add</Button>
      </div>
    </div>
  );
}

// ─── Task Comments & Attachments (edit mode) ──────────────────────────────────
function TaskExtras({ taskId, boardId, allTasks }: { taskId: number; boardId: number; allTasks: Task[] }) {
  const [comment, setComment] = useState("");
  const utils = trpc.useUtils();
  const { data: comments } = trpc.tasks.comments.useQuery({ taskId }, { enabled: taskId > 0 });
  const { data: attachments } = trpc.tasks.attachments.useQuery({ taskId }, { enabled: taskId > 0 });

  const addComment = trpc.tasks.addComment.useMutation({
    onSuccess: () => {
      utils.tasks.comments.invalidate({ taskId });
      setComment("");
      toast.success("Comment added");
    },
  });

  const uploadAttachment = trpc.tasks.uploadAttachment.useMutation({
    onSuccess: () => {
      utils.tasks.attachments.invalidate({ taskId });
      toast.success("File uploaded");
    },
    onError: () => toast.error("Upload failed — check storage configuration"),
  });

  const deleteAttachment = trpc.tasks.deleteAttachment.useMutation({
    onSuccess: () => utils.tasks.attachments.invalidate({ taskId }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      if (base64) {
        uploadAttachment.mutate({
          taskId,
          fileName: file.name,
          contentType: file.type,
          dataBase64: base64,
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <TaskDependenciesSection taskId={taskId} boardId={boardId} allTasks={allTasks} />
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Comments</Label>
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {(comments ?? []).map((c) => (
            <div key={c.id} className="text-xs bg-muted/50 rounded-md p-2">
              <span className="font-medium">{c.userName ?? "User"}</span>
              <span className="text-muted-foreground ml-2">{format(new Date(c.createdAt), "MMM d")}</span>
              <p className="mt-1">{c.content}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add a comment (@email to mention)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && comment.trim() && addComment.mutate({ taskId, content: comment.trim() })}
          />
          <Button size="sm" className="h-8" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate({ taskId, content: comment.trim() })}>
            Post
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> Attachments</Label>
        <div className="space-y-1">
          {(attachments ?? []).map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs bg-muted/50 rounded-md px-2 py-1.5">
              <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline truncate">
                <Download className="h-3 w-3 shrink-0" />
                {a.fileName}
              </a>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteAttachment.mutate({ id: a.id, taskId })}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Input type="file" className="h-8 text-xs" onChange={handleFile} disabled={uploadAttachment.isPending} />
      </div>
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({
  open,
  onClose,
  onCreated,
  task,
  boardId,
  columnId,
  columns,
  users,
  allTasks,
  initialAssigneeIds,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: number) => void;
  task: Task | null;
  boardId: number;
  columnId: number;
  columns: Column[];
  users: Array<{ id: number; name: string | null }>;
  allTasks: Task[];
  initialAssigneeIds?: number[];
}) {
  const utils = trpc.useUtils();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">(task?.priority ?? "medium");
  const [assigneeIds, setAssigneeIds] = useState<number[]>(() =>
    initialAssigneeIds?.length ? initialAssigneeIds : task?.assigneeId != null ? [task.assigneeId] : []
  );
  const [dueDate, setDueDate] = useState(task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
  const [selColumnId, setSelColumnId] = useState<string>(task?.columnId?.toString() ?? columnId.toString());
  const [tags, setTags] = useState<string[]>(() => parseTags(task?.tags));
  const [tagInput, setTagInput] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);

  const addTag = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setTags((prev) => {
      const key = trimmed.toLowerCase();
      if (prev.some((t) => t.toLowerCase() === key)) return prev;
      return [...prev, trimmed];
    });
    setTagInput("");
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  const toggleAssignee = useCallback((userId: number) => {
    setAssigneeIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setPriority(task?.priority ?? "medium");
    setAssigneeIds(
      initialAssigneeIds?.length
        ? initialAssigneeIds
        : task?.assigneeId != null
          ? [task.assigneeId]
          : []
    );
    setDueDate(task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
    setSelColumnId(task?.columnId?.toString() ?? columnId.toString());
    setTags(parseTags(task?.tags));
    setTagInput("");
    setTitleError(null);
  }, [open, task, columnId, initialAssigneeIds]);

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: async (taskId) => {
      await utils.tasks.byBoard.invalidate({ boardId });
      await utils.tasks.assigneesByBoard.invalidate({ boardId });
      await utils.tasks.blockedIds.invalidate({ boardId });
      toast.success("Task created");
      onCreated(taskId);
    },
    onError: (err) => toast.error(err.message || "Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      utils.tasks.byBoard.invalidate({ boardId });
      utils.tasks.assigneesByBoard.invalidate({ boardId });
      utils.tasks.blockedIds.invalidate({ boardId });
      toast.success("Task updated");
      onClose();
    },
    onError: (err) => toast.error(err.message || "Failed to update task"),
  });

  const handleSubmit = () => {
    if (!title.trim()) {
      setTitleError("Enter a task title to continue.");
      return;
    }
    setTitleError(null);
    const col = columns.find((c) => c.id === parseInt(selColumnId));
    if (!col) return;
    const resolvedStatus =
      inferStatusFromColumnName(col.name) ?? inferStatusFromColumnPosition(col.position);
    const serializedTags = serializeTags(tags);
    const payload = {
      title: title.trim(),
      description: description || undefined,
      priority,
      status: resolvedStatus,
      assigneeIds,
      assigneeId: assigneeIds[0],
      dueDate: dueDate || undefined,
      columnId: parseInt(selColumnId),
      tags: serializedTags,
    };
    if (isEdit && task) {
      updateTask.mutate({ id: task.id, ...payload });
    } else {
      createTask.mutate({ ...payload, boardId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title *</Label>
            <Input
              id="task-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(null);
              }}
              aria-invalid={!!titleError}
              aria-describedby={titleError ? "task-title-error" : "task-title-hint"}
            />
            <p id="task-title-hint" className="text-xs text-muted-foreground sr-only">
              Required. A short summary of the work.
            </p>
            {titleError && (
              <p id="task-title-error" role="alert" className="text-xs text-destructive">
                {titleError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Add more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              aria-describedby="task-description-hint"
            />
            <p id="task-description-hint" className="text-xs text-muted-foreground">
              Optional details, links, or acceptance criteria.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Column</Label>
              <Select value={selColumnId} onValueChange={setSelColumnId}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Assignees</Label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto border rounded-md p-2">
              {users.length === 0 && (
                <p className="text-xs text-muted-foreground">No members available</p>
              )}
              {users.map((u) => {
                const selected = assigneeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignee(u.id)}
                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {u.name ?? `User ${u.id}`}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Select one or more people.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-tags">Tags</Label>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 pr-1 font-normal">
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Input
              id="task-tags"
              placeholder="bug, frontend, design..."
              value={tagInput}
              onChange={(e) => {
                const value = e.target.value;
                if (value.includes(",")) {
                  value.split(",").forEach((part) => addTag(part));
                } else {
                  setTagInput(value);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
                  setTags((prev) => prev.slice(0, -1));
                }
              }}
              aria-describedby="task-tags-hint"
            />
            <p id="task-tags-hint" className="text-xs text-muted-foreground">
              Separate with comma or Enter. Optional.
            </p>
          </div>
          {isEdit && task && <TaskExtras taskId={task.id} boardId={boardId} allTasks={allTasks} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={createTask.isPending || updateTask.isPending}
          >
            {createTask.isPending || updateTask.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Board View ───────────────────────────────────────────────────────────────
export default function BoardView() {
  const params = useParams<{ projectId: string; boardId: string }>();
  const boardId = parseInt(params.boardId ?? "0");
  const projectId = parseInt(params.projectId ?? "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [showBoardSettings, setShowBoardSettings] = useState(false);

  const { data: board } = trpc.boards.byId.useQuery({ id: boardId });
  const { data: project } = trpc.projects.byId.useQuery({ id: projectId });
  const { data: cols, isLoading: colsLoading } = trpc.columns.byBoard.useQuery({ boardId });
  const { data: allTasks, isLoading: tasksLoading } = trpc.tasks.byBoard.useQuery({ boardId });
  const { data: blockedIdsList } = trpc.tasks.blockedIds.useQuery({ boardId });
  const blockedIds = useMemo(() => new Set(blockedIdsList ?? []), [blockedIdsList]);
  const { data: assigneesByTask } = trpc.tasks.assigneesByBoard.useQuery({ boardId });
  const { data: projectMembers } = trpc.team.listMembers.useQuery({ projectId });
  const { data: boardMembers } = trpc.boards.listMembers.useQuery(
    { boardId },
    { enabled: board?.accessMode === "restricted" }
  );
  const utils = trpc.useUtils();

  const currentUserRole = projectMembers?.find((m) => m.userId === user?.id)?.role;
  const canManage = canManageProject(currentUserRole, user?.role);

  const assigneeUsers =
    board?.accessMode === "restricted"
      ? (boardMembers ?? []).map((m) => ({ id: m.userId, name: m.name }))
      : (projectMembers ?? []).map((m) => ({ id: m.userId, name: m.name }));

  const [taskModal, setTaskModal] = useState<{ open: boolean; task: Task | null; columnId: number }>({
    open: false, task: null, columnId: 0,
  });
  const [addColumnName, setAddColumnName] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumnIndex, setActiveColumnIndex] = useState(0);
  const isMobile = useIsMobile();
  const columnRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const boardScrollRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const createColumn = trpc.columns.create.useMutation({
    onSuccess: () => {
      utils.columns.byBoard.invalidate({ boardId });
      setAddColumnName("");
      setShowAddColumn(false);
      toast.success("Column added");
    },
  });

  const deleteColumn = trpc.columns.delete.useMutation({
    onSuccess: () => {
      utils.columns.byBoard.invalidate({ boardId });
      utils.tasks.byBoard.invalidate({ boardId });
      toast.success("Column deleted");
    },
  });

  const updateColumn = trpc.columns.update.useMutation({
    onSuccess: () => utils.columns.byBoard.invalidate({ boardId }),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { utils.tasks.byBoard.invalidate({ boardId }); toast.success("Task deleted"); },
  });

  const reorderTasks = trpc.tasks.reorder.useMutation({
    onError: (err) => {
      utils.tasks.byBoard.invalidate({ boardId });
      toast.error(err.message || "Cannot move task");
    },
  });

  const applyTaskMove = useCallback(
    (taskId: number, targetColumnId: number, overTaskId?: string) => {
      if (!allTasks) return;
      const activeTask = allTasks.find((t) => t.id === taskId);
      if (!activeTask || activeTask.columnId === targetColumnId && !overTaskId) return;

      const targetTasks = allTasks
        .filter((t) => t.columnId === targetColumnId && t.id !== activeTask.id)
        .sort((a, b) => a.position - b.position);

      const overTaskIdx = overTaskId
        ? targetTasks.findIndex((t) => `task-${t.id}` === overTaskId)
        : targetTasks.length;

      const newTasks = [...targetTasks];
      newTasks.splice(overTaskIdx >= 0 ? overTaskIdx : targetTasks.length, 0, activeTask);

      const columnChanged = targetColumnId !== activeTask.columnId;
      const targetColumn = (cols ?? []).find((c) => c.id === targetColumnId);
      const inferredStatus = targetColumn
        ? inferStatusFromColumnName(targetColumn.name) ?? inferStatusFromColumnPosition(targetColumn.position)
        : activeTask.status;
      const newStatus = columnChanged ? inferredStatus : activeTask.status;

      if (columnChanged && targetColumn && isDoneColumn(targetColumn.name)) {
        toast.success("Task completed!");
      }

      const updates = newTasks.map((t, i) => ({
        id: t.id,
        position: i,
        columnId: targetColumnId,
        ...(t.id === activeTask.id && columnChanged ? { status: newStatus } : {}),
      }));

      utils.tasks.byBoard.setData({ boardId }, (old) => {
        if (!old) return old;
        return old.map((t) => {
          const upd = updates.find((u) => u.id === t.id);
          if (upd) return { ...t, columnId: upd.columnId, position: upd.position, status: upd.status ?? t.status };
          return t;
        });
      });

      reorderTasks.mutate({ boardId, updates });
    },
    [allTasks, cols, boardId, utils, reorderTasks]
  );

  const scrollToColumn = (index: number) => {
    setActiveColumnIndex(index);
    const col = cols?.[index];
    if (!col) return;
    const el = columnRefs.current.get(col.id);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  useEffect(() => {
    if (!isMobile || !cols?.length) return;
    if (activeColumnIndex >= cols.length) setActiveColumnIndex(0);
  }, [isMobile, cols, activeColumnIndex]);

  const getTasksForColumn = useCallback(
    (columnId: number) =>
      (allTasks ?? [])
        .filter((t) => t.columnId === columnId)
        .sort((a, b) => a.position - b.position),
    [allTasks]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { data } = event.active;
    if (data.current?.type === "task") setActiveTask(data.current.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over || !allTasks) return;

    const activeId = active.id.toString();
    const overId = over.id.toString();
    if (activeId === overId) return;

    const activeTaskItem = allTasks.find((t) => `task-${t.id}` === activeId);
    if (!activeTaskItem) return;

    let targetColumnId = activeTaskItem.columnId;
    if (overId.startsWith("col-")) {
      targetColumnId = parseInt(overId.replace("col-", ""));
    } else if (overId.startsWith("task-")) {
      const overTask = allTasks.find((t) => `task-${t.id}` === overId);
      if (overTask) targetColumnId = overTask.columnId;
    }

    applyTaskMove(activeTaskItem.id, targetColumnId, overId.startsWith("task-") ? overId : undefined);
  };

  const isLoading = colsLoading || tasksLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Board Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={() => setLocation("/projects")}>
                  Projects
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <button type="button" onClick={() => setLocation(`/projects/${projectId}`)}>
                  {project?.name ?? "Project"}
                </button>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{board?.name ?? "Board"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center gap-2">
          {board?.accessMode === "restricted" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <Lock className="h-3 w-3" />
              Restrito
            </Badge>
          )}
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setShowBoardSettings(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </Button>
          )}
          {showAddColumn ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Column name"
                value={addColumnName}
                onChange={(e) => setAddColumnName(e.target.value)}
                className="h-8 text-xs w-36"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && addColumnName.trim()) {
                    createColumn.mutate({ boardId, name: addColumnName.trim(), position: (cols?.length ?? 0) });
                  }
                  if (e.key === "Escape") { setShowAddColumn(false); setAddColumnName(""); }
                }}
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => addColumnName.trim() && createColumn.mutate({ boardId, name: addColumnName.trim(), position: cols?.length ?? 0 })}
                disabled={!addColumnName.trim() || createColumn.isPending}
              >
                Add
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setShowAddColumn(false); setAddColumnName(""); }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowAddColumn(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Column
            </Button>
          )}
        </div>
      </div>

      {/* Mobile column tabs */}
      {isMobile && (cols ?? []).length > 0 && (
        <div className="flex gap-1 px-4 py-2 overflow-x-auto border-b shrink-0 bg-background">
          {(cols ?? []).map((col, index) => (
            <button
              key={col.id}
              type="button"
              onClick={() => scrollToColumn(index)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                activeColumnIndex === index
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {col.name}
            </button>
          ))}
        </div>
      )}

      {/* Board Content */}
      <div
        ref={boardScrollRef}
        className={cn(
          "flex-1 overflow-x-auto",
          isMobile ? "overflow-y-hidden snap-x snap-mandatory" : "overflow-y-hidden"
        )}
      >
        <div
          className={cn(
            "flex gap-5 p-4 md:p-6 h-full",
            isMobile ? "flex-row min-h-full" : "flex-row md:min-w-max"
          )}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {(cols ?? []).map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                tasks={getTasksForColumn(col.id)}
                users={assigneeUsers}
                columns={cols ?? []}
                isDragging={!!activeTask}
                isMobile={isMobile}
                columnRef={(el) => {
                  if (el) columnRefs.current.set(col.id, el);
                  else columnRefs.current.delete(col.id);
                }}
                onAddTask={(colId) => setTaskModal({ open: true, task: null, columnId: colId })}
                onEditTask={(task) => setTaskModal({ open: true, task, columnId: task.columnId })}
                onDeleteTask={(id) => deleteTask.mutate({ id })}
                onDeleteColumn={(id) => deleteColumn.mutate({ id, boardId })}
                onRenameColumn={(id, name) => updateColumn.mutate({ id, name, boardId })}
                onMoveToColumn={applyTaskMove}
                blockedIds={blockedIds}
                assigneesByTask={assigneesByTask}
              />
            ))}

            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  users={assigneeUsers}
                  columns={cols ?? []}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onMoveToColumn={() => {}}
                  isDragging
                  assigneeIds={assigneesByTask?.[activeTask.id]}
                />
              )}
            </DragOverlay>
          </DndContext>

          {(cols ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full min-h-[40vh]">
              <Empty className="border-0 max-w-sm">
                <EmptyMedia variant="icon">
                  <Plus />
                </EmptyMedia>
                <EmptyContent>
                  <EmptyTitle>No columns yet</EmptyTitle>
                  <EmptyDescription>Add a column to start organizing tasks.</EmptyDescription>
                  <Button onClick={() => setShowAddColumn(true)}>Add Column</Button>
                </EmptyContent>
              </Empty>
            </div>
          )}
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        open={taskModal.open}
        onClose={() => setTaskModal({ open: false, task: null, columnId: 0 })}
        onCreated={async (taskId) => {
          const boardTasks = await utils.tasks.byBoard.fetch({ boardId });
          const created = boardTasks?.find((t) => t.id === taskId) ?? null;
          if (created) {
            setTaskModal({ open: true, task: created, columnId: created.columnId });
          }
        }}
        task={taskModal.task}
        boardId={boardId}
        columnId={taskModal.columnId}
        columns={cols ?? []}
        users={assigneeUsers}
        allTasks={allTasks ?? []}
        initialAssigneeIds={
          taskModal.task ? assigneesByTask?.[taskModal.task.id] : undefined
        }
      />

      <BoardSettingsDialog
        open={showBoardSettings}
        onClose={() => setShowBoardSettings(false)}
        boardId={boardId}
        projectId={projectId}
        name={board?.name ?? ""}
        description={board?.description ?? null}
        accessMode={board?.accessMode ?? "project"}
        canManage={canManage}
        onDeleted={() => setLocation(`/projects/${projectId}`)}
      />
    </div>
  );
}
