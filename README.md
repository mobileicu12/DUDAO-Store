# DUDAO — trade counter portal

Staff back-office for a trade counter business: point-of-sale billing,
invoicing, a customer payment ledger, inventory with multi-tier pricing, and
staff accounts with per-feature permissions.

There is **no public storefront** — the portal is the whole application.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, server components) |
| Styling | Tailwind CSS v4, CSS custom-property theme, light/dark |
| Auth | NextAuth v5 — Google OAuth + owner-issued email/password |
| Data | PostgreSQL via Prisma 7 |
| Documents | jsPDF + jspdf-autotable |
| Spreadsheets | ExcelJS |
| Barcodes | @zxing/browser (scanning), jsbarcode (labels) |
| Messaging | Resend (email), WhatsApp Cloud API |

> Next 16 renamed `middleware.ts` to `proxy.ts` and runs it on the Node
> runtime. Auth gating lives in `proxy.ts`.

## Getting started

```bash
npm install
cp .env.example .env        # then fill in DATABASE_URL and PORTAL_OWNER_EMAIL
npx prisma migrate deploy   # create the tables
npm run db:seed             # settings, integrations, invoice counter
npm run dev
```

Open http://localhost:3000 — you will be redirected to `/login`.

### The two variables you must set

- `DATABASE_URL` — any PostgreSQL 14+ instance (local, Neon, Supabase).
- `PORTAL_OWNER_EMAIL` — comma-separated. These accounts always hold every
  permission and cannot be edited or removed from the team screen.

Set `PORTAL_SESSION_SECRET` too: it signs public document links and doubles as
an emergency master password for owner access.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` then a production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:migrate` | Create and apply a migration in development |
| `npm run db:deploy` | Apply existing migrations (use in CI/production) |
| `npm run db:studio` | Browse the database |
| `npm run db:seed` | Create the singleton rows |

## Architecture

### Three-layer permission enforcement

Nine feature permissions (`inventory`, `billing`, `invoices`, `orders`,
`customers`, `collections`, `reports`, `settings`, `users`) are enforced in
three places, and all three are load-bearing:

1. **`proxy.ts`** gates page navigation by URL prefix and redirects to
   `/no-access`. Role and permissions are baked into the JWT at sign-in, so
   this never touches the database.
2. **`lib/guard.ts`** re-checks on every API route. **This is the real
   boundary** — a member with a browser console never touches the proxy.
   Do not remove an API guard because "the proxy already handles it".
3. **`lib/nav.ts`** hides menu items a member cannot use. Cosmetic only.

There is a fourth, financial gate: staff see today's takings and customer
balances, but **all-time turnover requires the `reports` permission**
(`useCanSeeFinance`).

### The data layer

Everything goes through helpers in `lib/`. Pages and API routes never call
Prisma directly. That is what made swapping the datastore a contained change,
and it is worth preserving.

- Money is `Decimal(12,2)`, never `Float`. `lib/db.ts` converts at the
  boundary with `num()` / `numOrNull()`.
- Invoice lines **snapshot** title, SKU and unit price rather than joining to
  the product, so an old invoice still prints correctly after the product is
  renamed, repriced or deleted.
- Invoice numbers come from an atomic transaction, so two tills completing a
  sale simultaneously get different numbers.
- API secrets live in the `Integration` table, separate from `Setting`, so a
  staff member reading `/api/settings` can never see the WhatsApp token. A
  blank value on save means "keep the stored secret".

### Multi-tier pricing

One product carries five prices: the base price plus `wholesale`, `shop`,
`ebay` and `amazon`. **A blank tier falls back to the base price** — it does
not mean zero. `lib/pricing.ts` is client-safe and shared by the till, the
product editor and the importer so the same price is computed the same way
everywhere. Wholesale beats the channel tier: a trade customer buying at the
counter pays trade.

## Deploying to Vercel

The build will fail until the environment variables are set — there is no
database to connect to otherwise. In the Vercel project, under
**Settings → Environment Variables**, add:

| Variable | Required | What to put |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | A pooled Postgres URL (Neon, Supabase, Vercel Postgres). Neon's free tier is enough to start. |
| `AUTH_SECRET` | **yes** | `openssl rand -base64 32` |
| `PORTAL_OWNER_EMAIL` | **yes** | Your email. Comma-separate for more than one owner. |
| `PORTAL_SESSION_SECRET` | **yes** | `openssl rand -base64 32`. Signs share links and is the master password. |
| `NEXT_PUBLIC_SITE_URL` | recommended | Your deployed URL, e.g. `https://dudao.vercel.app`. Needed for share links in messages. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | optional | Only if you want Google sign-in. Without them, email + password works. |
| `RESEND_API_KEY` / `EMAIL_FROM` | optional | Enables emailing invoices. Send buttons hide when unset. |
| `CRON_SECRET` | optional | Bearer token the daily-digest cron must present. |
| `NEXT_PUBLIC_BIZ_*` | optional | Letterhead defaults; anything saved in Settings overrides them. |

Then:

1. **Create the tables.** Run `npx prisma migrate deploy` against the
   production `DATABASE_URL` once — locally with the URL exported, or as a
   Vercel deploy/release command. (The `postinstall` only runs `prisma
   generate`, which builds the client and does **not** need a database.)
2. **Seed the singletons** (optional but tidy): `npm run db:seed`.
3. Redeploy. You will land on `/login`; sign in with the master password
   (`PORTAL_SESSION_SECRET`) or, if configured, Google.

> The `vercel.json` in the repo already schedules the daily digest at 20:30
> UTC — no extra setup needed for the cron.

Any other Node host works the same way: set the variables, run
`prisma migrate deploy`, then `npm run build && npm start`.

## What's built

All of it:

- Theme system and UI primitives; light/dark with no flash.
- Auth (Google + password + master), three-layer permissions, portal shell.
- Dashboard with today's takings (all staff) and gated all-time turnover.
- Inventory grid, product editor, collections, Excel import/export.
- Point of sale with tier re-pricing and barcode scanning; invoices with a
  full line-editor and payments.
- Customers with the payment ledger, opening balances and trade codes.
- Orders — the by-channel view of completed invoices.
- Universal PDF invoices, statements and reports; HMAC-signed public links.
- Email (Resend) and WhatsApp (Meta Cloud API); the idempotent daily digest
  and a manual today's-send drawer.
- Settings, team management, owner backup, channels board.
