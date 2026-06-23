export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";

const COLUMN_STATUS_MAP: Array<{ match: RegExp; status: TaskStatus }> = [
  { match: /\bdone\b/i, status: "done" },
  { match: /\breview\b/i, status: "in_review" },
  { match: /\bprogress\b/i, status: "in_progress" },
  { match: /\b(to[\s-]?do|todo|backlog)\b/i, status: "todo" },
];

/** Infer task status from a kanban column name (e.g. "In Progress" → in_progress). */
export function inferStatusFromColumnName(name: string): TaskStatus | null {
  for (const { match, status } of COLUMN_STATUS_MAP) {
    if (match.test(name)) return status;
  }
  return null;
}

/** Map default column position to status when name matching fails. */
export function inferStatusFromColumnPosition(position: number): TaskStatus {
  const byPosition: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
  return byPosition[position] ?? "todo";
}
