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

if (url && url.trim()) {
  console.log("DATABASE_URL set — applying migrations…");
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log("No DATABASE_URL — skipping migrations (set it in your host to enable).");
}
