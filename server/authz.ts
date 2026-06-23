import { TRPCError } from "@trpc/server";
import type { ProjectRole } from "../drizzle/schema";

const ROLE_RANK: Record<ProjectRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(userRole: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

export function forbidden(message = "You do not have access to this resource"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function notFound(message = "Resource not found"): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}
