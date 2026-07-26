/**
 * Marketplace routing. CLIENT-SAFE.
 *
 * Which listings a product should appear on, stored as `channel:<key>` tags.
 *
 * These tags are the portal's own record of intent — they do not themselves
 * publish anything. Actual listing is done by exporting a filtered sheet for
 * each marketplace. Keeping intent separate from publication means a failed
 * upload never silently changes what the shop meant to list.
 */

export type ChannelKey =
  | "online"
  | "ebay1"
  | "ebay2"
  | "amazon1"
  | "amazon2";

export type ChannelDef = {
  key: ChannelKey;
  label: string;
  short: string;
  tag: string;
  /** Marketplace family, for grouping in the UI. */
  family: "store" | "ebay" | "amazon";
  description: string;
};

export const CHANNELS: ChannelDef[] = [
  {
    key: "online",
    label: "Online store",
    short: "Store",
    tag: "channel:online",
    family: "store",
    description: "Your own website storefront.",
  },
  {
    key: "ebay1",
    label: "eBay — account 1",
    short: "eBay 1",
    tag: "channel:ebay1",
    family: "ebay",
    description: "Primary eBay selling account.",
  },
  {
    key: "ebay2",
    label: "eBay — account 2",
    short: "eBay 2",
    tag: "channel:ebay2",
    family: "ebay",
    description: "Second eBay selling account.",
  },
  {
    key: "amazon1",
    label: "Amazon — account 1",
    short: "Amzn 1",
    tag: "channel:amazon1",
    family: "amazon",
    description: "Primary Amazon seller account.",
  },
  {
    key: "amazon2",
    label: "Amazon — account 2",
    short: "Amzn 2",
    tag: "channel:amazon2",
    family: "amazon",
    description: "Second Amazon seller account.",
  },
];

export const CHANNEL_KEYS: ChannelKey[] = CHANNELS.map((c) => c.key);

export const channelDef = (key: string): ChannelDef | undefined =>
  CHANNELS.find((c) => c.key === key);

export const isChannelTag = (tag: string): boolean =>
  tag.toLowerCase().startsWith("channel:");

export function channelsFromTags(
  tags: string[] | null | undefined,
): ChannelKey[] {
  if (!tags) return [];
  const found = tags
    .filter(isChannelTag)
    .map((t) => t.slice(8).trim().toLowerCase());
  return CHANNEL_KEYS.filter((k) => found.includes(k));
}

export const tagsForChannels = (keys: ChannelKey[]): string[] =>
  keys.map((k) => `channel:${k}`);

/** Swap channel tags, preserving segments and every other tag. */
export function withChannels(
  tags: string[] | null | undefined,
  keys: ChannelKey[],
): string[] {
  const kept = (tags ?? []).filter((t) => !isChannelTag(t));
  return [...kept, ...tagsForChannels(keys)];
}

/** Which price tier a channel sells at, for the "what will this list at" hint. */
export function tierForChannel(key: ChannelKey): "ebay" | "amazon" | null {
  if (key.startsWith("ebay")) return "ebay";
  if (key.startsWith("amazon")) return "amazon";
  return null;
}
