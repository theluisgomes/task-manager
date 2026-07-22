export type ProjectRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<ProjectRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(userRole: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

/** Platform-wide superuser (`users.role = admin`). */
export function isGlobalAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

/** Owners and project admins — or global admins — can manage project/board settings. */
export function canManageProject(
  projectRole: string | null | undefined,
  globalRole?: string | null
): boolean {
  if (isGlobalAdmin(globalRole)) return true;
  return projectRole === "owner" || projectRole === "admin";
}
