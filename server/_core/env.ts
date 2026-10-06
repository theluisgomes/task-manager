export const ENV = {
  appId: process.env.VITE_APP_ID ?? (process.env.NODE_ENV !== "production" ? "local-dev-app" : ""),
  cookieSecret: process.env.JWT_SECRET ?? (process.env.NODE_ENV !== "production" ? "local-dev-jwt-secret" : ""),
  databaseUrl: process.env.DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID ?? "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  paymentReminderEmail: process.env.PAYMENT_REMINDER_EMAIL ?? "rodrigo@wisemetrics.in",
  financeViewerEmails: process.env.FINANCE_VIEWER_EMAILS ?? "",
  financeViewerOpenIds: process.env.FINANCE_VIEWER_OPEN_IDS ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL || "qwen/qwen3-30b-a3b-instruct-2507",
  openRouterFallbackModel: process.env.OPENROUTER_FALLBACK_MODEL || "google/gemma-4-31b-it:free",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  openRouterTimeoutMs: parseInt(process.env.OPENROUTER_TIMEOUT_MS ?? "60000", 10),
};

export function isOAuthConfigured(): boolean {
  return Boolean(
    (ENV.googleClientId && ENV.googleClientSecret) ||
      (ENV.microsoftClientId && ENV.microsoftClientSecret)
  );
}

export const OPENROUTER_KEY_PLACEHOLDER = "sk-or-v1-your-key-here";

export function isOpenRouterConfigured(): boolean {
  const key = ENV.openRouterApiKey.trim();
  return key.length > 0 && key !== OPENROUTER_KEY_PLACEHOLDER;
}

export function getOAuthRedirectUri(path: string): string {
  const base = ENV.oauthRedirectBaseUrl || `http://localhost:${process.env.PORT ?? "3000"}`;
  return `${base.replace(/\/+$/, "")}${path}`;
}
