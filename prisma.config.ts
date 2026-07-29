import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 config for the CLI (migrate, studio). The runtime connection is made
 * separately through the pg driver adapter in lib/db.ts.
 *
 * Having a config file disables Prisma's automatic .env loading, so we load it
 * ourselves for the CLI. On a hosting platform there is no .env file — the
 * variables are already in the environment — so a missing file is ignored.
 * `prisma generate` (run in postinstall) never connects, so it succeeds even
 * with no URL; `migrate deploy` runs in the build where the URL is present.
 */
if (!process.env.DATABASE_URL) {
  try {
    if (fs.existsSync(".env")) process.loadEnvFile(".env");
  } catch {
    // No .env / unreadable — rely on the ambient environment.
  }
}
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
