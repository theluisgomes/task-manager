import { isGlobalAdmin } from "./roles";

export function parseCsvList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function canSeeMoney(
  user: { role?: string | null; email?: string | null; openId?: string | null },
  viewers: { emails?: string[]; openIds?: string[] } = {}
): boolean {
  if (isGlobalAdmin(user.role)) return true;
  const email = user.email?.trim().toLowerCase();
  if (email && viewers.emails?.some((item) => item.toLowerCase() === email)) return true;
  const openId = user.openId?.trim();
  if (openId && viewers.openIds?.some((item) => item === openId)) return true;
  return false;
}
