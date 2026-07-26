/**
 * Bootstrap a fresh database.
 *
 * Creates the singleton Setting and Integration rows and the invoice counter.
 * Deliberately creates NO products — the catalog starts empty and is filled by
 * the owner, either through the product form or an Excel import.
 *
 * Safe to re-run: every write is an upsert.
 *
 *   DATABASE_URL=... npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL ?? "";
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const settings = await db.setting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  await db.integration.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  await db.counter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, year: new Date().getFullYear(), seq: 0 },
  });

  console.log(`Settings ready for "${settings.name}".`);
  console.log(`Invoice numbers will start at ${settings.invoicePrefix}-${new Date().getFullYear()}-0001.`);

  const owners = (process.env.PORTAL_OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (owners.length === 0) {
    console.warn(
      "\nPORTAL_OWNER_EMAIL is not set — nobody can sign in yet.\n" +
        "Set it to your email address and restart.",
    );
  } else {
    console.log(`Owner access: ${owners.join(", ")}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
