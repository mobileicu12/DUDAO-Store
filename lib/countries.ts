// Country dial codes for phone fields (client-safe — no server imports).
export type Country = { iso: string; name: string; dial: string; flag: string };

export const COUNTRIES: Country[] = [
  { iso: "GB", name: "United Kingdom", dial: "+44", flag: "🇬🇧" },
  { iso: "IE", name: "Ireland", dial: "+353", flag: "🇮🇪" },
  { iso: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { iso: "IN", name: "India", dial: "+91", flag: "🇮🇳" },
  { iso: "PK", name: "Pakistan", dial: "+92", flag: "🇵🇰" },
  { iso: "BD", name: "Bangladesh", dial: "+880", flag: "🇧🇩" },
  { iso: "AE", name: "UAE", dial: "+971", flag: "🇦🇪" },
  { iso: "SA", name: "Saudi Arabia", dial: "+966", flag: "🇸🇦" },
  { iso: "NG", name: "Nigeria", dial: "+234", flag: "🇳🇬" },
  { iso: "ZA", name: "South Africa", dial: "+27", flag: "🇿🇦" },
  { iso: "DE", name: "Germany", dial: "+49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "+33", flag: "🇫🇷" },
  { iso: "ES", name: "Spain", dial: "+34", flag: "🇪🇸" },
  { iso: "IT", name: "Italy", dial: "+39", flag: "🇮🇹" },
  { iso: "NL", name: "Netherlands", dial: "+31", flag: "🇳🇱" },
  { iso: "PL", name: "Poland", dial: "+48", flag: "🇵🇱" },
  { iso: "PT", name: "Portugal", dial: "+351", flag: "🇵🇹" },
  { iso: "RO", name: "Romania", dial: "+40", flag: "🇷🇴" },
  { iso: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
  { iso: "AU", name: "Australia", dial: "+61", flag: "🇦🇺" },
  { iso: "CN", name: "China", dial: "+86", flag: "🇨🇳" },
  { iso: "HK", name: "Hong Kong", dial: "+852", flag: "🇭🇰" },
  { iso: "SG", name: "Singapore", dial: "+65", flag: "🇸🇬" },
  { iso: "TR", name: "Turkey", dial: "+90", flag: "🇹🇷" },
  { iso: "EG", name: "Egypt", dial: "+20", flag: "🇪🇬" },
  { iso: "KE", name: "Kenya", dial: "+254", flag: "🇰🇪" },
  { iso: "GH", name: "Ghana", dial: "+233", flag: "🇬🇭" },
  { iso: "LK", name: "Sri Lanka", dial: "+94", flag: "🇱🇰" },
  { iso: "NP", name: "Nepal", dial: "+977", flag: "🇳🇵" },
  { iso: "AF", name: "Afghanistan", dial: "+93", flag: "🇦🇫" },
];

export const DEFAULT_COUNTRY = "GB";

/**
 * Best-effort split of a stored phone number back into a country + local part,
 * so re-opening a saved customer shows the right flag. Matches the longest dial
 * code first ("+1" must not win over "+91").
 */
export function splitPhone(value: string): { iso: string; number: string } {
  const v = (value || "").trim();
  if (v.startsWith("+")) {
    const byLongest = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    const hit = byLongest.find((c) => v.startsWith(c.dial));
    if (hit) return { iso: hit.iso, number: v.slice(hit.dial.length).trim() };
  }
  return { iso: DEFAULT_COUNTRY, number: v };
}

export const dialFor = (iso: string): string =>
  COUNTRIES.find((c) => c.iso === iso)?.dial ?? "";
