import { TRPCError } from "@trpc/server";

export function forbidden(message = "You do not have access to this resource"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function notFound(message = "Resource not found"): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}

export function assertFinanceAdmin(role: string): void {
  if (role !== "admin") forbidden("Finance access restricted to administrators");
}
