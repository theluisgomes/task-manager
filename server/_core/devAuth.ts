import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

const DEV_OPEN_ID = "local-dev-user";

export function registerDevAuthRoutes(app: Express) {
  if (ENV.isProduction) return;

  app.get("/api/dev/login", async (req: Request, res: Response) => {
    try {
      await db.upsertUser({
        openId: DEV_OPEN_ID,
        name: "Local Dev User",
        email: "dev@localhost",
        loginMethod: "dev",
        role: "admin",
        lastSignedIn: new Date(),
      });

      const devUser = await db.getUserByOpenId(DEV_OPEN_ID);
      if (devUser) {
        // Dev login uses a separate openId from OAuth users. When DATABASE_URL
        // points at a shared DB (e.g. Cloud SQL), grant access to existing projects.
        await db.ensureUserAccessToAllProjects(devUser.id, "admin");
      }

      const sessionToken = await sdk.createSessionToken(DEV_OPEN_ID, {
        name: "Local Dev User",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[DevAuth] Login failed", error);
      res.status(500).send("Dev login failed — ensure DATABASE_URL and JWT_SECRET are set.");
    }
  });

  console.log("[DevAuth] Local dev login available at /api/dev/login");
}
