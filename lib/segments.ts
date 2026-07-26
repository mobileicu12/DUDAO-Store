/**
 * Segments — where a customer or an order came from. CLIENT-SAFE.
 *
 * Stored as string tags in the form `seg:<key>` on the customer and invoice
 * rows. Kept as tags rather than an enum column so a new channel can be added
 * without a migration, and so exports carry the segment as readable text.
 */

export type SegmentKey = "online" | "shop" | "ebay" | "amazon";

export type SegmentDef = {
  key: SegmentKey;
  label: string;
  /** Badge text where space is tight. */
  short: string;
  tag: string;
  description: string;
  /** Tailwind classes for the badge. Tokens only — no raw colours. */
  badge: string;
};

export const SEGMENTS: SegmentDef[] = [
  {
    key: "shop",
    label: "In shop",
    short: "Shop",
    tag: "seg:shop",
    description: "Walk-in trade served at the counter.",
    badge: "bg-accent-subtle text-accent",
  },
  {
    key: "online",
    label: "Online",
    short: "Online",
    tag: "seg:online",
    description: "Ordered through the website.",
    badge: "bg-info-subtle text-info",
  },
  {
    key: "ebay",
    label: "eBay",
    short: "eBay",
    tag: "seg:ebay",
    description: "Sold through an eBay listing.",
    badge: "bg-warning-subtle text-warning",
  },
  {
    key: "amazon",
    label: "Amazon",
    short: "Amzn",
    tag: "seg:amazon",
    description: "Sold through an Amazon listing.",
    badge: "bg-success-subtle text-success",
  },
];

export const SEGMENT_KEYS: SegmentKey[] = SEGMENTS.map((s) => s.key);

export const segmentDef = (key: string): SegmentDef | undefined =>
  SEGMENTS.find((s) => s.key === key);

export const segmentLabel = (key: string): string =>
  segmentDef(key)?.label ?? key;

export const isSegmentTag = (tag: string): boolean =>
  tag.toLowerCase().startsWith("seg:");

/** Pull segment keys out of a tag list, ignoring unknown seg: tags. */
export function segmentsFromTags(tags: string[] | null | undefined): SegmentKey[] {
  if (!tags) return [];
  const found = tags
    .filter(isSegmentTag)
    .map((t) => t.slice(4).trim().toLowerCase());
  return SEGMENT_KEYS.filter((k) => found.includes(k));
}

export const tagsForSegments = (keys: SegmentKey[]): string[] =>
  keys.map((k) => `seg:${k}`);

/**
 * Replace the segment tags on a tag list, leaving every other tag untouched.
 * Callers must not simply overwrite tags — that would wipe channel routing and
 * any tag the owner set by hand.
 */
export function withSegments(
  tags: string[] | null | undefined,
  keys: SegmentKey[],
): string[] {
  const kept = (tags ?? []).filter((t) => !isSegmentTag(t));
  return [...kept, ...tagsForSegments(keys)];
}

/**
 * Best-effort segment for a record that carries no seg: tag — anything
 * imported from the old system, or created before segments were set up.
 */
export function segmentFromSource(
  source: string | null | undefined,
): SegmentKey {
  const s = (source ?? "").toLowerCase();
  if (s.includes("pos")) return "shop";
  if (s.includes("ebay")) return "ebay";
  if (s.includes("amazon")) return "amazon";
  return "online";
}
