import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 config for the CLI (migrate, studio). The runtime connection is made
 * separately through the pg driver adapter in lib/db.ts.
 *
 * The datasource URL is read from process.env directly rather than through the
 * `env()` helper, which throws when the variable is unset. `prisma generate`
 * (run in postinstall) must succeed on a build machine that has no DATABASE_URL
 * yet — it only reads the schema, it never connects. `migrate deploy` is run as
 * a separate release step where the URL is present.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
