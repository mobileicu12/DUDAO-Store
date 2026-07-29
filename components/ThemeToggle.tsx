"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "dudao-theme";

/**
 * Inlined into <head> so the .dark class is on <html> before the browser paints.
 * Without this the app renders light for one frame then snaps to dark, which is
 * very visible on a dim shop floor at night.
 *
 * Kept as a string because it must run before React hydrates.
 */
export const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var choice = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    var dark = choice === 'dark' ||
      (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

function apply(choice: ThemeChoice): void {
  const dark =
    choice === "dark" ||
    (choice === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

const SUN =
  "M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.36-6.36-1.06 1.06M6.7 17.3l-1.06 1.06m12.72 0-1.06-1.06M6.7 6.7 5.64 5.64M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z";
const MOON = "M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z";

/**
 * A single light/dark switch. The old three-way Light/System/Dark control was
 * fiddly in the header; this is one button that flips the theme. First load
 * still follows the OS (via THEME_SCRIPT); the first tap makes an explicit
 * choice and stops following the OS.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [isDark, setIsDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    setReady(true);
  }, []);

  // While still on "system", keep tracking OS changes until the user chooses.
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      apply("system");
      setIsDark(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next: ThemeChoice = isDark ? "light" : "dark";
    setIsDark(!isDark);
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  };

  const showMoon = ready && isDark;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={showMoon ? "Switch to light mode" : "Switch to dark mode"}
      title={showMoon ? "Switch to light mode" : "Switch to dark mode"}
      className={[
        "flex items-center justify-center rounded-md border border-line-strong bg-surface text-ink-2 transition-colors hover:bg-subtle hover:text-ink",
        compact ? "h-9 w-9" : "h-9 w-9",
      ].join(" ")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-[1.15rem] w-[1.15rem]"
        aria-hidden
      >
        <path d={showMoon ? MOON : SUN} />
      </svg>
    </button>
  );
}
