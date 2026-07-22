#!/usr/bin/env tsx
/**
 * Task Manager diagnostic suite — read-only checks for local and production.
 *
 * Usage:
 *   pnpm doctor              # local checks
 *   pnpm doctor --prod       # local + production (Cloud SQL proxy + health URL)
 *   pnpm doctor --smoke        # minimal DB smoke test (for CI)
 *   pnpm doctor --json         # machine-readable output
 */

import "dotenv/config";
import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { pingDatabase } from "../server/db";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Status = "OK" | "WARN" | "FAIL";

interface CheckResult {
  name: string;
  status: Status;
  message: string;
  details?: string;
}

const args = process.argv.slice(2);
const isProd = args.includes("--prod");
const isSmoke = args.includes("--smoke");
const isJson = args.includes("--json");
const skipDeps = args.includes("--skip-deps");

const results: CheckResult[] = [];

function add(name: string, status: Status, message: string, details?: string) {
  results.push({ name, status, message, details });
}

function worstStatus(): Status {
  if (results.some(r => r.status === "FAIL")) return "FAIL";
  if (results.some(r => r.status === "WARN")) return "WARN";
  return "OK";
}

function exitCode(): number {
  const w = worstStatus();
  if (w === "FAIL") return 1;
  if (w === "WARN") return 2;
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function dirSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function parseEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function runCmd(cmd: string, timeoutMs = 120_000): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT_DIR,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ok: true, stdout: stdout.trim(), stderr: "" };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      stdout: (e.stdout ?? "").toString().trim(),
      stderr: (e.stderr ?? "").toString().trim(),
    };
  }
}

function checkPrerequisites() {
  const node = runCmd("node -v");
  if (node.ok && node.stdout.match(/^v(2[0-9]|[3-9]\d)/)) {
    add("prerequisites.node", "OK", `Node ${node.stdout}`);
  } else {
    add("prerequisites.node", "FAIL", "Node 20+ required", node.stderr || node.stdout);
  }

  const pnpm = runCmd("pnpm -v");
  if (pnpm.ok) {
    add("prerequisites.pnpm", "OK", `pnpm ${pnpm.stdout}`);
  } else {
    add("prerequisites.pnpm", "FAIL", "pnpm not found");
  }
}

function checkEnv(label: string, isProduction: boolean) {
  const required = ["DATABASE_URL", "JWT_SECRET"];
  const missing = required.filter(k => !process.env[k]?.trim());
  if (missing.length) {
    add(`env.${label}.required`, "FAIL", `Missing: ${missing.join(", ")}`);
  } else {
    add(`env.${label}.required`, "OK", "DATABASE_URL and JWT_SECRET set");
  }

  if (isProduction) {
    const devDefaults = ["local-dev-jwt-secret", "local-dev-app"];
    if (devDefaults.includes(process.env.JWT_SECRET ?? "")) {
      add(`env.${label}.jwt`, "FAIL", "JWT_SECRET must not use dev default in production");
    }
    if (!process.env.GOOGLE_CLIENT_ID && !process.env.MICROSOFT_CLIENT_ID) {
      add(`env.${label}.oauth`, "WARN", "No OAuth provider configured");
    }
  }
}

async function getDrizzle() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return drizzle(url);
  } catch {
    return null;
  }
}

async function checkDatabase(label: string) {
  const connected = await pingDatabase();
  if (!connected) {
    add(`db.${label}.ping`, "FAIL", "Cannot connect to MySQL");
    return;
  }
  add(`db.${label}.ping`, "OK", "MySQL reachable");

  const db = await getDrizzle();
  if (!db) {
    add(`db.${label}.migrations`, "FAIL", "Could not open Drizzle connection");
    return;
  }

  try {
    const versionRows = await db.execute(sql`SELECT VERSION() as version`);
    const version = (versionRows[0] as unknown as { version: string }[])?.[0]?.version ?? "unknown";
    add(`db.${label}.version`, "OK", `MySQL ${version}`);
  } catch (err) {
    add(`db.${label}.version`, "WARN", "Could not read MySQL version", String(err));
  }

  const journalPath = path.join(ROOT_DIR, "drizzle/meta/_journal.json");
  let expected: string[] = [];
  try {
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
      entries: { tag: string }[];
    };
    expected = journal.entries.map(e => e.tag);
  } catch {
    add(`db.${label}.migrations`, "FAIL", "Could not read drizzle journal");
    return;
  }

  try {
    const appliedResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM __drizzle_migrations`);
    const appliedCnt = Number((appliedResult[0] as unknown as { cnt: number }[])?.[0]?.cnt ?? 0);
    const expectedCnt = expected.length;

    if (appliedCnt >= expectedCnt) {
      add(`db.${label}.migrations`, "OK", `${appliedCnt}/${expectedCnt} migrations applied`);
    } else {
      const pending = expectedCnt - appliedCnt;
      add(
        `db.${label}.migrations`,
        "WARN",
        `${pending} pending migration(s) (${appliedCnt}/${expectedCnt} applied)`,
        expected.slice(appliedCnt).join(", "),
      );
    }
  } catch (err) {
    add(`db.${label}.migrations`, "WARN", "Could not read __drizzle_migrations", String(err));
  }
}

async function checkIntegrity(label: string) {
  const db = await getDrizzle();
  if (!db) return;

  try {
    const orphanTasks = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM tasks t
      LEFT JOIN columns c ON t.columnId = c.id
      WHERE c.id IS NULL
    `);
    const cnt = Number((orphanTasks[0] as unknown as { cnt: number }[])?.[0]?.cnt ?? 0);
    if (cnt === 0) {
      add(`integrity.${label}.orphan_tasks`, "OK", "No tasks with missing columns");
    } else {
      add(`integrity.${label}.orphan_tasks`, "WARN", `${cnt} task(s) reference missing columns`);
    }
  } catch (err) {
    add(`integrity.${label}.orphan_tasks`, "WARN", "Could not check orphan tasks", String(err));
  }

  try {
    const orphanMembers = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM project_members pm
      LEFT JOIN users u ON pm.userId = u.id
      WHERE u.id IS NULL
    `);
    const cnt = Number((orphanMembers[0] as unknown as { cnt: number }[])?.[0]?.cnt ?? 0);
    if (cnt === 0) {
      add(`integrity.${label}.orphan_members`, "OK", "No project members with missing users");
    } else {
      add(`integrity.${label}.orphan_members`, "WARN", `${cnt} member(s) reference missing users`);
    }
  } catch (err) {
    add(`integrity.${label}.orphan_members`, "WARN", "Could not check orphan members", String(err));
  }

  try {
    const expiredInvites = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM team_invites
      WHERE status = 'pending' AND expiresAt < NOW()
    `);
    const cnt = Number((expiredInvites[0] as unknown as { cnt: number }[])?.[0]?.cnt ?? 0);
    if (cnt === 0) {
      add(`integrity.${label}.expired_invites`, "OK", "No stale pending invites");
    } else {
      add(`integrity.${label}.expired_invites`, "WARN", `${cnt} pending invite(s) past expiry`);
    }
  } catch (err) {
    add(`integrity.${label}.expired_invites`, "WARN", "Could not check expired invites", String(err));
  }

  if (label === "local" && !process.env.BUILT_IN_FORGE_API_URL) {
    try {
      const attachments = await db.execute(sql`SELECT storageKey FROM task_attachments`);
      const rows = attachments[0] as unknown as { storageKey: string }[];
      const uploadDirs = [
        path.join(ROOT_DIR, "uploads"),
        path.join(ROOT_DIR, "server/uploads"),
      ];
      let missing = 0;
      for (const row of rows) {
        const found = uploadDirs.some(dir => fs.existsSync(path.join(dir, row.storageKey)));
        if (!found) missing++;
      }
      if (missing === 0) {
        add(`integrity.${label}.attachments`, "OK", `All ${rows.length} attachment file(s) present locally`);
      } else {
        add(`integrity.${label}.attachments`, "WARN", `${missing} attachment file(s) missing on disk`);
      }
    } catch (err) {
      add(`integrity.${label}.attachments`, "WARN", "Could not verify attachment files", String(err));
    }
  }
}

async function checkHealth(label: string, url: string) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`, { signal: controller.signal });
    clearTimeout(timer);
    const latency = Date.now() - start;
    const body = (await res.json()) as { ok?: boolean; db?: string };

    if (res.ok && body.ok && body.db === "connected") {
      add(`health.${label}`, "OK", `Healthy (${latency}ms)`, JSON.stringify(body));
    } else if (res.status === 503 || body.db === "unavailable") {
      add(`health.${label}`, "FAIL", `App up but DB unavailable (${latency}ms)`, JSON.stringify(body));
    } else {
      add(`health.${label}`, "WARN", `Unexpected health response HTTP ${res.status}`, JSON.stringify(body));
    }
  } catch (err) {
    add(`health.${label}`, label === "local" ? "WARN" : "FAIL", `Health check failed: ${url}`, String(err));
  }
}

function checkDisk() {
  const dirs = [
    { name: "uploads", path: path.join(ROOT_DIR, "uploads") },
    { name: "server_uploads", path: path.join(ROOT_DIR, "server/uploads") },
    { name: "node_modules", path: path.join(ROOT_DIR, "node_modules") },
  ];
  for (const { name, path: dirPath } of dirs) {
    if (!fs.existsSync(dirPath)) {
      add(`disk.${name}`, "OK", "Not present");
      continue;
    }
    const size = dirSize(dirPath);
    const status: Status = name === "node_modules" && size > 1024 * 1024 * 1024 ? "WARN" : "OK";
    add(`disk.${name}`, status, formatBytes(size));
  }
}

function checkDependencies() {
  const audit = runCmd("pnpm audit --audit-level=moderate", 180_000);
  if (audit.ok) {
    add("deps.audit", "OK", "No moderate+ vulnerabilities");
  } else {
    const summary = audit.stdout.split("\n").slice(-5).join("\n") || audit.stderr;
    add("deps.audit", "WARN", "pnpm audit reported issues", summary);
  }

  const outdated = runCmd("pnpm outdated", 180_000);
  if (outdated.ok && !outdated.stdout) {
    add("deps.outdated", "OK", "All dependencies up to date");
  } else {
    const lines = outdated.stdout.split("\n").filter(l => l.trim()).slice(0, 15);
    add("deps.outdated", "WARN", `${lines.length > 1 ? lines.length - 1 : 0} package(s) may be outdated`, lines.join("\n"));
  }
}

function getGitInfo(): { branch: string; commit: string } {
  const branch = runCmd("git rev-parse --abbrev-ref HEAD");
  const commit = runCmd("git rev-parse --short HEAD");
  return {
    branch: branch.ok ? branch.stdout : "unknown",
    commit: commit.ok ? commit.stdout : "unknown",
  };
}

async function startCloudSqlProxy(
  deployEnv: Record<string, string>,
): Promise<{ pid: number; databaseUrl: string } | null> {
  const projectId = deployEnv.PROJECT_ID;
  const sqlInstance = deployEnv.SQL_INSTANCE;
  const dbUser = deployEnv.DB_USER;
  const dbPassword = deployEnv.DB_PASSWORD;
  const dbName = deployEnv.DB_NAME;

  if (!projectId || !sqlInstance || !dbUser || !dbPassword || !dbName) {
    add("prod.config", "FAIL", "deploy.env missing required Cloud SQL fields");
    return null;
  }

  const connResult = runCmd(
    `gcloud sql instances describe "${sqlInstance}" --project="${projectId}" --format='value(connectionName)'`,
  );
  if (!connResult.ok) {
    add("prod.proxy", "FAIL", "Could not get Cloud SQL connection name", connResult.stderr);
    return null;
  }
  const conn = connResult.stdout;

  let proxyBin = "cloud-sql-proxy";
  const which = runCmd("command -v cloud-sql-proxy");
  if (!which.ok) {
    proxyBin = path.join(ROOT_DIR, ".cache/cloud-sql-proxy");
    if (!fs.existsSync(proxyBin)) {
      add("prod.proxy", "FAIL", "Cloud SQL proxy not found — run deploy-gcp.sh migrate once");
      return null;
    }
  }

  const port = 3308;
  const child = spawn(proxyBin, [conn, "--port", String(port)], {
    cwd: ROOT_DIR,
    stdio: "ignore",
    detached: false,
  });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const probe = runCmd(`node -e "const n=require('net');const s=n.connect(${port},'127.0.0.1',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1))"`);
    if (probe.ok) break;
    if (i === 29) {
      child.kill();
      add("prod.proxy", "FAIL", "Cloud SQL proxy did not become ready");
      return null;
    }
  }

  add("prod.proxy", "OK", `Proxy running on port ${port}`);
  return {
    pid: child.pid!,
    databaseUrl: `mysql://${dbUser}:${dbPassword}@127.0.0.1:${port}/${dbName}`,
  };
}

function getProdHealthUrl(deployEnv: Record<string, string>): string | null {
  if (deployEnv.CUSTOM_DOMAIN) {
    return deployEnv.CUSTOM_DOMAIN.replace(/\/+$/, "");
  }
  const projectId = deployEnv.PROJECT_ID;
  const region = deployEnv.REGION;
  const serviceName = deployEnv.SERVICE_NAME;
  if (!projectId || !region || !serviceName) return null;

  const urlResult = runCmd(
    `gcloud run services describe "${serviceName}" --project="${projectId}" --region="${region}" --format='value(status.url)'`,
  );
  return urlResult.ok ? urlResult.stdout : null;
}

function printResults() {
  if (isJson) {
    console.log(JSON.stringify({ results, status: worstStatus(), git: getGitInfo() }, null, 2));
    return;
  }

  console.log("\nTask Manager Doctor\n");
  for (const r of results) {
    const icon = r.status === "OK" ? "✓" : r.status === "WARN" ? "!" : "✗";
    console.log(`  [${icon}] ${r.name}: ${r.message}`);
    if (r.details) {
      for (const line of r.details.split("\n")) {
        console.log(`      ${line}`);
      }
    }
  }
  console.log(`\nOverall: ${worstStatus()}\n`);
}

async function runLocalChecks() {
  if (!isSmoke) {
    checkPrerequisites();
    checkEnv("local", process.env.NODE_ENV === "production");
    checkDisk();
    if (!skipDeps) checkDependencies();
  }

  await checkDatabase("local");
  if (!isSmoke) {
    await checkIntegrity("local");
    const port = process.env.PORT ?? "3000";
    await checkHealth("local", `http://localhost:${port}`);
  }
}

async function runProdChecks(proxy: { pid: number; databaseUrl: string }) {
  const prevUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = proxy.databaseUrl;

  try {
    await checkDatabase("prod");
    await checkIntegrity("prod");
  } finally {
    process.env.DATABASE_URL = prevUrl;
    try {
      process.kill(proxy.pid);
    } catch {
      // proxy already stopped
    }
  }
}

async function main() {
  await runLocalChecks();

  if (isProd && !isSmoke) {
    const deployEnvPath = path.join(ROOT_DIR, "scripts/deploy.env");
    if (!fs.existsSync(deployEnvPath)) {
      add("prod.config", "FAIL", "scripts/deploy.env not found — copy from deploy.env.example");
    } else {
      const deployEnv = parseEnvFile(deployEnvPath);
      const healthUrl = getProdHealthUrl(deployEnv);
      if (healthUrl) {
        await checkHealth("prod", healthUrl);
      } else {
        add("health.prod", "WARN", "Could not determine production URL (set CUSTOM_DOMAIN or deploy first)");
      }

      const proxy = await startCloudSqlProxy(deployEnv);
      if (proxy) {
        await runProdChecks(proxy);
      }
    }
  }

  printResults();
  process.exit(exitCode());
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
