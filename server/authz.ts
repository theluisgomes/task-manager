import { TRPCError } from "@trpc/server";
import { canSeeMoney, parseCsvList } from "@shared/financeAccess";
import { ENV } from "./_core/env";

export function forbidden(message = "You do not have access to this resource"): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

export function notFound(message = "Resource not found"): never {
  throw new TRPCError({ code: "NOT_FOUND", message });
}

export function financeViewers() {
  return {
    emails: parseCsvList(ENV.financeViewerEmails),
    openIds: parseCsvList(ENV.financeViewerOpenIds),
  };
}

export function userCanSeeMoney(user: {
  role?: string | null;
  email?: string | null;
  openId?: string | null;
}) {
  return canSeeMoney(user, financeViewers());
}

export function assertCanSeeMoney(user: {
  role?: string | null;
  email?: string | null;
  openId?: string | null;
}): void {
  if (!userCanSeeMoney(user)) forbidden("Finance access restricted");
}

export function assertFinanceAdmin(role: string): void {
  if (role !== "admin") forbidden("Finance access restricted to administrators");
}
