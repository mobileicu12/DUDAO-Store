// Run `prisma migrate deploy` only when a database is configured.
//
// The build calls this so a deploy self-applies the schema once DATABASE_URL
// is set — but a build with no database (e.g. before the DB is provisioned)
// must still succeed rather than fail on an empty connection URL.
import { execSync } from "node:child_process";
import fs from "node:fs";

// Mirror prisma.config.ts: if the URL isn't in the environment, try .env.
let url = process.env.DATABASE_URL;
if (!url) {
  try {
    if (fs.existsSync(".env")) {
      const line = fs
        .readFileSync(".env", "utf8")
        .split("\n")
        .find((l) => l.startsWith("DATABASE_URL="));
      if (line) url = line.slice("DATABASE_URL=".length).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // ignore
  }
}

// A synchronous sleep so the retry loop can pause without top-level await.
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (url && url.trim()) {
  console.log("DATABASE_URL set — applying migrations…");
  // `prisma migrate deploy` is idempotent, so retrying is always safe. It can
  // fail transiently on a serverless database (Neon) two ways that both clear
  // on their own: a cold-start connection timeout, and — when two deploys run
  // at once — a timeout acquiring the migration advisory lock (P1002) while the
  // other build holds it. Back off and retry rather than failing the build; the
  // retry finds the migrations already applied and exits cleanly.
  const attempts = 5;
  for (let i = 1; i <= attempts; i++) {
    try {
      execSync("prisma migrate deploy", { stdio: "inherit" });
      break;
    } catch (err) {
      if (i === attempts) {
        console.error(`Migrations failed after ${attempts} attempts.`);
        throw err;
      }
      const wait = 2000 * 2 ** (i - 1); // 2s, 4s, 8s, 16s
      console.log(`Migrate attempt ${i} failed (likely a cold start or a concurrent deploy holding the lock). Retrying in ${wait / 1000}s…`);
      sleep(wait);
    }
  }
} else {
  console.log("No DATABASE_URL — skipping migrations (set it in your host to enable).");
}
