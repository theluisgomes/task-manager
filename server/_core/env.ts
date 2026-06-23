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
};

export function isOAuthConfigured(): boolean {
  return Boolean(
    (ENV.googleClientId && ENV.googleClientSecret) ||
      (ENV.microsoftClientId && ENV.microsoftClientSecret)
  );
}

export function getOAuthRedirectUri(path: string): string {
  const base = ENV.oauthRedirectBaseUrl || `http://localhost:${process.env.PORT ?? "3000"}`;
  return `${base.replace(/\/+$/, "")}${path}`;
}
