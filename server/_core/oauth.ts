import { randomBytes } from "crypto";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { acceptPendingInvitesForEmail, getInviteByToken } from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV, getOAuthRedirectUri, isOAuthConfigured } from "./env";
import { sdk } from "./sdk";

type OAuthProvider = "google" | "microsoft";

const pendingStates = new Map<string, { provider: OAuthProvider; createdAt: number; returnTo?: string }>();

function cleanupStates() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, val] of Array.from(pendingStates.entries())) {
    if (val.createdAt < cutoff) pendingStates.delete(key);
  }
}

function createState(provider: OAuthProvider, returnTo?: string): string {
  cleanupStates();
  const state = randomBytes(24).toString("hex");
  pendingStates.set(state, { provider, createdAt: Date.now(), returnTo });
  return state;
}

function consumeState(state: string) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  return entry;
}

function safeReturnTo(returnTo?: string): string {
  if (returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return "/";
}

async function resolvePostLoginRedirect(returnTo?: string): Promise<string> {
  const safe = safeReturnTo(returnTo);
  const inviteMatch = safe.match(/^\/invite\/([A-Za-z0-9_-]+)$/);
  if (!inviteMatch) return safe;

  const invite = await getInviteByToken(inviteMatch[1]);
  if (invite?.status === "accepted") {
    return `/projects/${invite.projectId}`;
  }
  return safe;
}

async function exchangeGoogleCode(code: string, redirectUri: string) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) throw new Error(`Google token exchange failed: ${await resp.text()}`);
  const data = (await resp.json()) as { access_token: string };
  const userResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!userResp.ok) throw new Error("Google userinfo failed");
  const user = (await userResp.json()) as { id: string; email?: string; name?: string; picture?: string };
  return {
    openId: `google:${user.id}`,
    email: user.email ?? null,
    name: user.name ?? null,
    avatarUrl: user.picture ?? null,
    loginMethod: "google" as const,
  };
}

async function exchangeMicrosoftCode(code: string, redirectUri: string) {
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.microsoftClientId,
      client_secret: ENV.microsoftClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) throw new Error(`Microsoft token exchange failed: ${await resp.text()}`);
  const data = (await resp.json()) as { access_token: string };
  const userResp = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!userResp.ok) throw new Error("Microsoft userinfo failed");
  const user = (await userResp.json()) as { id: string; mail?: string; userPrincipalName?: string; displayName?: string };
  return {
    openId: `microsoft:${user.id}`,
    email: user.mail ?? user.userPrincipalName ?? null,
    name: user.displayName ?? null,
    avatarUrl: null,
    loginMethod: "microsoft" as const,
  };
}

async function finishLogin(req: Request, res: Response, userInfo: {
  openId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  loginMethod: string;
}, returnTo?: string) {
  await db.upsertUser({
    openId: userInfo.openId,
    name: userInfo.name,
    email: userInfo.email,
    loginMethod: userInfo.loginMethod,
    lastSignedIn: new Date(),
  });

  const user = await db.getUserByOpenId(userInfo.openId);
  if (user) {
    void db.recordPlatformVisit(user.id);
  }

  if (userInfo.email) {
    await acceptPendingInvitesForEmail(userInfo.email, userInfo.openId);
  }

  const sessionToken = await sdk.createSessionToken(userInfo.openId, {
    name: userInfo.name || "",
    expiresInMs: ONE_YEAR_MS,
  });

  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
  const redirectTo = await resolvePostLoginRedirect(returnTo);
  res.redirect(302, redirectTo);
}

export function registerOAuthRoutes(app: Express) {
  if (!isOAuthConfigured()) {
    console.log("[OAuth] Google/Microsoft credentials not set — using dev login only");
    return;
  }

  app.get("/api/auth/google", (req: Request, res: Response) => {
    const redirectUri = getOAuthRedirectUri("/api/auth/callback");
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
    const state = createState("google", returnTo);
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "online");
    res.redirect(url.toString());
  });

  app.get("/api/auth/microsoft", (req: Request, res: Response) => {
    const redirectUri = getOAuthRedirectUri("/api/auth/callback");
    const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
    const state = createState("microsoft", returnTo);
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", ENV.microsoftClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile User.Read");
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  app.get("/api/auth/callback", async (req: Request, res: Response) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }

    const stateEntry = consumeState(state);
    if (!stateEntry) {
      res.status(400).send("Invalid or expired state");
      return;
    }

    try {
      const redirectUri = getOAuthRedirectUri("/api/auth/callback");
      const userInfo =
        stateEntry.provider === "google"
          ? await exchangeGoogleCode(code, redirectUri)
          : await exchangeMicrosoftCode(code, redirectUri);
      await finishLogin(req, res, userInfo, stateEntry.returnTo);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).send("Authentication failed");
    }
  });

  console.log("[OAuth] Google/Microsoft auth routes registered");
}
