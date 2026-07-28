/**
 * Join class names, dropping falsey ones. Server- and client-safe — unlike the
 * copy in components/ui/primitives, which lives in a "use client" module and so
 * cannot be called from a server component.
 */
export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
