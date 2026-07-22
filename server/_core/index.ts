import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "node:path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoutes } from "./devAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { pingDatabase } from "../db";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/health", async (_req, res) => {
    const dbConnected = await pingDatabase();
    const timestamp = new Date().toISOString();
    if (!dbConnected) {
      res.status(503).json({ ok: false, db: "unavailable", timestamp });
      return;
    }
    res.json({ ok: true, db: "connected", timestamp });
  });

  app.use("/uploads", express.static(path.resolve(import.meta.dirname, "../../uploads")));

  registerStorageProxy(app);
  registerDevAuthRoutes(app);
  registerOAuthRoutes(app);

  app.post("/api/cron/payment-reminders", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const header = req.headers["authorization"];
    const token = typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7)
      : (req.headers["x-cron-secret"] as string | undefined);
    if (secret && token !== secret) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    try {
      const { sendPaymentDueReminders } = await import("../operationalDb");
      const result = await sendPaymentDueReminders();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[cron/payment-reminders]", err);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  let port = preferredPort;
  if (!(await isPortAvailable(preferredPort))) {
    if (process.env.NODE_ENV === "development") {
      console.error(
        `Port ${preferredPort} is already in use. Stop the other process (e.g. lsof -i :${preferredPort}) or set PORT in .env.`
      );
      process.exit(1);
    }
    port = await findAvailablePort(preferredPort);
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
