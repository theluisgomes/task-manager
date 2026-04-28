import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Calendar,
  GripVertical,
  MoreHorizontal,
  Plus,
  Trash2,
  User,
  X,
  Edit3,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays, isToday, isTomorrow } from "date-fns";

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

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  users,
  onEdit,
  onDelete,
  isDragging,
}: {
  task: Task;
  users: Array<{ id: number; name: string | null }>;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
  isDragging?: boolean;
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
              className="mt-0.5 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-1">
                <p
                  className="text-xs font-medium leading-snug cursor-pointer hover:text-primary transition-colors"
                  onClick={() => onEdit(task)}
                >
                  {task.title}
                </p>
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
                  {assignee && (
                    <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center" title={assignee.name ?? ""}>
                      <span className="text-[9px] font-semibold text-primary">
                        {(assignee.name ?? "?").charAt(0).toUpperCase()}
                      </span>
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
  onAddTask,
  onEditTask,
  onDeleteTask,
  onDeleteColumn,
  onRenameColumn,
}: {
  column: Column;
  tasks: Task[];
  users: Array<{ id: number; name: string | null }>;
  onAddTask: (columnId: number) => void;
  onEditTask: (task: Task) => void;
  onDeleteTask: (id: number) => void;
  onDeleteColumn: (id: number) => void;
  onRenameColumn: (id: number, name: string) => void;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(column.name);

  const { setNodeRef } = useSortable({
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

  return (
    <div
      ref={setNodeRef}
      className="flex flex-col w-72 shrink-0"
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: column.color ?? "#e2e8f0" }}
          />
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
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
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

      {/* Tasks */}
      <div className="flex-1 space-y-2 min-h-[120px]">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              users={users}
              onEdit={onEditTask}
              onDelete={onDeleteTask}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-1.5">
            <p className="text-[11px] text-muted-foreground">No tasks yet</p>
          </div>
        )}
      </div>

      {/* Add Task */}
      <Button
        variant="ghost"
        size="sm"
        className="mt-3 w-full justify-start gap-1.5 text-muted-foreground hover:text-foreground h-8 text-xs"
        onClick={() => onAddTask(column.id)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add task
      </Button>
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
function TaskModal({
  open,
  onClose,
  task,
  boardId,
  columnId,
  columns,
  users,
}: {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  boardId: number;
  columnId: number;
  columns: Column[];
  users: Array<{ id: number; name: string | null }>;
}) {
  const utils = trpc.useUtils();
  const isEdit = !!task;

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">(task?.priority ?? "medium");
  const [status, setStatus] = useState<"todo" | "in_progress" | "in_review" | "done">(task?.status ?? "todo");
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId?.toString() ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ? format(new Date(task.dueDate), "yyyy-MM-dd") : "");
  const [selColumnId, setSelColumnId] = useState<string>(task?.columnId?.toString() ?? columnId.toString());

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { utils.tasks.byBoard.invalidate({ boardId }); toast.success("Task created"); onClose(); },
    onError: () => toast.error("Failed to create task"),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => { utils.tasks.byBoard.invalidate({ boardId }); toast.success("Task updated"); onClose(); },
    onError: () => toast.error("Failed to update task"),
  });

  const handleSubmit = () => {
    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      description: description || undefined,
      priority,
      status,
      assigneeId: assigneeId ? parseInt(assigneeId) : undefined,
      dueDate: dueDate || undefined,
      columnId: parseInt(selColumnId),
    };
    if (isEdit && task) {
      updateTask.mutate({ id: task.id, ...payload });
    } else {
      createTask.mutate({ ...payload, boardId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea
              placeholder="Add more details..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
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
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assigneeId || "none"} onValueChange={(v) => setAssigneeId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name ?? `User ${u.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || createTask.isPending || updateTask.isPending}
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

  const { data: board } = trpc.boards.byId.useQuery({ id: boardId });
  const { data: project } = trpc.projects.byId.useQuery({ id: projectId });
  const { data: cols, isLoading: colsLoading } = trpc.columns.byBoard.useQuery({ boardId });
  const { data: allTasks, isLoading: tasksLoading } = trpc.tasks.byBoard.useQuery({ boardId });
  const { data: users } = trpc.team.listUsers.useQuery();
  const utils = trpc.useUtils();

  const [taskModal, setTaskModal] = useState<{ open: boolean; task: Task | null; columnId: number }>({
    open: false, task: null, columnId: 0,
  });
  const [addColumnName, setAddColumnName] = useState("");
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

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
    onSuccess: () => { utils.columns.byBoard.invalidate({ boardId }); toast.success("Column deleted"); },
  });

  const updateColumn = trpc.columns.update.useMutation({
    onSuccess: () => utils.columns.byBoard.invalidate({ boardId }),
  });

  const deleteTask = trpc.tasks.delete.useMutation({
    onSuccess: () => { utils.tasks.byBoard.invalidate({ boardId }); toast.success("Task deleted"); },
  });

  const reorderTasks = trpc.tasks.reorder.useMutation();

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

    const activeTask = allTasks.find((t) => `task-${t.id}` === activeId);
    if (!activeTask) return;

    // Determine target column
    let targetColumnId = activeTask.columnId;
    if (overId.startsWith("col-")) {
      targetColumnId = parseInt(overId.replace("col-", ""));
    } else if (overId.startsWith("task-")) {
      const overTask = allTasks.find((t) => `task-${t.id}` === overId);
      if (overTask) targetColumnId = overTask.columnId;
    }

    const targetTasks = allTasks
      .filter((t) => t.columnId === targetColumnId && t.id !== activeTask.id)
      .sort((a, b) => a.position - b.position);

    const overTaskIdx = overId.startsWith("task-")
      ? targetTasks.findIndex((t) => `task-${t.id}` === overId)
      : targetTasks.length;

    const newTasks = [...targetTasks];
    newTasks.splice(overTaskIdx, 0, activeTask);

    const updates = newTasks.map((t, i) => ({
      id: t.id,
      position: i,
      columnId: targetColumnId,
    }));

    // Optimistic update
    utils.tasks.byBoard.setData({ boardId }, (old) => {
      if (!old) return old;
      return old.map((t) => {
        const upd = updates.find((u) => u.id === t.id);
        if (upd) return { ...t, columnId: upd.columnId, position: upd.position };
        return t;
      });
    });

    reorderTasks.mutate({ updates });
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
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setLocation("/projects")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Projects
          </button>
          <span className="text-muted-foreground">/</span>
          <button
            onClick={() => setLocation(`/projects/${projectId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {project?.name ?? "Project"}
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{board?.name ?? "Board"}</span>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Board Content */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-5 p-6 h-full min-w-max">
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
                users={users ?? []}
                onAddTask={(colId) => setTaskModal({ open: true, task: null, columnId: colId })}
                onEditTask={(task) => setTaskModal({ open: true, task, columnId: task.columnId })}
                onDeleteTask={(id) => deleteTask.mutate({ id })}
                onDeleteColumn={(id) => deleteColumn.mutate({ id })}
                onRenameColumn={(id, name) => updateColumn.mutate({ id, name })}
              />
            ))}

            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  users={users ?? []}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>

          {(cols ?? []).length === 0 && (
            <div className="flex items-center justify-center w-full">
              <div className="text-center space-y-3">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
                  <Plus className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="font-medium">No columns yet</p>
                <p className="text-sm text-muted-foreground">Add a column to start organizing tasks</p>
                <Button onClick={() => setShowAddColumn(true)}>Add Column</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Task Modal */}
      <TaskModal
        open={taskModal.open}
        onClose={() => setTaskModal({ open: false, task: null, columnId: 0 })}
        task={taskModal.task}
        boardId={boardId}
        columnId={taskModal.columnId}
        columns={cols ?? []}
        users={users ?? []}
      />
    </div>
  );
}
