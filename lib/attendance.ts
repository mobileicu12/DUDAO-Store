import "server-only";
import { db } from "./db";

/** Cookie holding the date the caller last tapped in (YYYY-MM-DD). */
export const TAPIN_COOKIE = "dudau_tapin";

/**
 * Staff time-clock (tap in / tap out).
 *
 * When "Require staff to tap in" is on in Settings, a signed-in user must
 * re-enter their password once per shift before they can use the portal. They
 * tap out manually from the header, and anyone still open is closed by the
 * nightly digest job (recorded as an automatic tap-out).
 *
 * Records live in the Attendance table; nothing here talks to an external
 * service, so the clock keeps working with the portal fully offline of any
 * sales channel.
 */

export type TodayShift = {
  email: string;
  name: string;
  tapIn: string; // ISO
  tapOut: string | null; // ISO or null while open
  autoOut: boolean;
  minutes: number;
  open: boolean;
};

const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** The user's open shift started today, if any. */
export async function openRecord(
  email: string,
): Promise<{ id: string; tapIn: Date } | null> {
  return db.attendance.findFirst({
    where: { email: email.toLowerCase(), tapOut: null, tapIn: { gte: startOfToday() } },
    select: { id: true, tapIn: true },
    orderBy: { tapIn: "desc" },
  });
}

/** Is this user currently tapped in? */
export async function isTappedIn(email: string): Promise<boolean> {
  return (await openRecord(email)) !== null;
}

/** Open a fresh shift, closing any stray open record for this user first. */
export async function tapIn(email: string, name?: string): Promise<void> {
  const e = email.toLowerCase();
  const now = new Date();
  await db.attendance.updateMany({
    where: { email: e, tapOut: null },
    data: { tapOut: now },
  });
  await db.attendance.create({
    data: { email: e, name: name ?? "", tapIn: now },
  });
}

/** Close every open shift for this user. */
export async function tapOut(email: string): Promise<void> {
  await db.attendance.updateMany({
    where: { email: email.toLowerCase(), tapOut: null },
    data: { tapOut: new Date() },
  });
}

/** Close everyone still open — the nightly job. Returns how many were closed. */
export async function autoTapOutAll(): Promise<number> {
  const res = await db.attendance.updateMany({
    where: { tapOut: null },
    data: { tapOut: new Date(), autoOut: true },
  });
  return res.count;
}

/** Today's shifts, newest first, with elapsed minutes. */
export async function listToday(): Promise<TodayShift[]> {
  const rows = await db.attendance.findMany({
    where: { tapIn: { gte: startOfToday() } },
    orderBy: { tapIn: "desc" },
  });
  return rows.map((r) => {
    const end = r.tapOut ? +r.tapOut : Date.now();
    return {
      email: r.email,
      name: r.name,
      tapIn: r.tapIn.toISOString(),
      tapOut: r.tapOut ? r.tapOut.toISOString() : null,
      autoOut: r.autoOut,
      minutes: Math.max(0, Math.round((end - +r.tapIn) / 60000)),
      open: !r.tapOut,
    };
  });
}
