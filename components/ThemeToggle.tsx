"use client";

import { useEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_KEY = "dudau-theme";

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

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  {
    value: "light",
    label: "Light",
    icon: "M12 3v1.5m0 15V21m9-9h-1.5m-15 0H3m15.36-6.36-1.06 1.06M6.7 17.3l-1.06 1.06m12.72 0-1.06-1.06M6.7 6.7 5.64 5.64M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z",
  },
  {
    value: "system",
    label: "System",
    icon: "M3.75 5.25h16.5v10.5H3.75zM8.25 19.5h7.5M12 15.75v3.75",
  },
  {
    value: "dark",
    label: "Dark",
    icon: "M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z",
  },
];

export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as ThemeChoice | null;
    setChoice(
      stored === "light" || stored === "dark" || stored === "system"
        ? stored
        : "system",
    );
    setReady(true);
  }, []);

  // Following the OS only means anything if we react when the OS changes.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    localStorage.setItem(THEME_KEY, next);
    apply(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-subtle p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = ready && choice === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            onClick={() => pick(opt.value)}
            className={[
              "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-muted hover:text-ink",
            ].join(" ")}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0"
              aria-hidden
            >
              <path d={opt.icon} />
            </svg>
            {!compact && <span className="hidden sm:inline">{opt.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
