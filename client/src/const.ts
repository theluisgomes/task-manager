export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

/**
 * OAuth availability is determined at runtime via the `auth.providers` tRPC
 * query (see useAuthProviders), not at build time. OAuth secrets are injected
 * at runtime on Cloud Run, so a build-time flag was always false in production.
 */

/** Local dev login at /api/dev/login (never available in production builds). */
export function isDevLoginAvailable(): boolean {
  return import.meta.env.DEV;
}

export function getDevLoginUrl(): string {
  return `${window.location.origin}/api/dev/login`;
}

export function getGoogleLoginUrl(returnTo?: string): string {
  const url = new URL(`${window.location.origin}/api/auth/google`);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function getMicrosoftLoginUrl(returnTo?: string): string {
  const url = new URL(`${window.location.origin}/api/auth/microsoft`);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

/** @deprecated Use provider-specific login URLs */
export const getLoginUrl = getDevLoginUrl;
