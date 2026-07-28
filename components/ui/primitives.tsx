"use client";

import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const cx = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "success"
  | "outline";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all " +
  "disabled:pointer-events-none disabled:opacity-50 active:scale-[.985] " +
  "whitespace-nowrap select-none";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-surface shadow-sm hover:opacity-90",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-subtle",
  outline:
    "bg-transparent text-ink-2 border border-line-strong hover:bg-subtle hover:text-ink",
  ghost: "bg-transparent text-muted hover:bg-subtle hover:text-ink",
  danger: "bg-danger text-white shadow-sm hover:brightness-110",
  success: "bg-success text-white shadow-sm hover:brightness-110",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-3.5 text-sm",
  lg: "h-11 px-5 text-[0.95rem]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      full = false,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cx(
          BUTTON_BASE,
          BUTTON_VARIANT[variant],
          BUTTON_SIZE[size],
          full && "w-full",
          className,
        )}
        {...rest}
      >
        {loading ? <Spinner className="h-4 w-4" /> : icon}
        {children}
      </button>
    );
  },
);

/** Square icon-only button — used heavily in table rows and toolbars. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { label: string }
>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, ...rest },
  ref,
) {
  const box = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANT[variant],
        box,
        "shrink-0 p-0",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  padded = true,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-lg border border-line bg-surface shadow-sm",
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

const FIELD_BASE =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink " +
  "placeholder:text-faint transition-colors " +
  "hover:border-muted focus:border-accent focus:outline-none " +
  "focus:ring-2 focus:ring-[var(--accent-ring)] " +
  "disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx(
        FIELD_BASE,
        "h-9",
        invalid && "border-danger focus:border-danger",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx(FIELD_BASE, "resize-y py-2 leading-relaxed", className)}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cx(FIELD_BASE, "h-9 cursor-pointer pr-8", className)}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium text-ink-2"
        >
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        "inline-flex items-center gap-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </button>
      {label && <span className="text-sm text-ink">{label}</span>}
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={cx(
        "inline-flex items-start gap-2.5",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span
        className={cx(
          "mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors",
          checked || indeterminate
            ? "border-accent bg-accent text-accentfg"
            : "border-line-strong bg-surface",
        )}
        style={{ height: "1.125rem", width: "1.125rem" }}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {indeterminate ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path d="M4 8h8" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
          </svg>
        ) : checked ? (
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              d="M3.5 8.5l3 3 6-6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      {label && <span className="text-sm leading-5 text-ink">{label}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

export type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-subtle text-muted border-line",
  accent: "bg-accent-subtle text-accent border-transparent",
  success: "bg-success-subtle text-success border-transparent",
  warning: "bg-warning-subtle text-warning border-transparent",
  danger: "bg-danger-subtle text-danger border-transparent",
  info: "bg-info-subtle text-info border-transparent",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        BADGE_TONE[tone],
        className,
      )}
    >
      {dot && (
        <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      )}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx("animate-spin", className ?? "h-5 w-5")}
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity={0.2}
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-md", className ?? "h-4 w-full")} />;
}

export function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-subtle text-muted">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        {message && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{message}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const toneClass: Record<Tone, string> = {
    neutral: "bg-subtle text-ink-2 border-line",
    accent: "bg-accent-subtle text-accent border-transparent",
    success: "bg-success-subtle text-success border-transparent",
    warning: "bg-warning-subtle text-warning border-transparent",
    danger: "bg-danger-subtle text-danger border-transparent",
    info: "bg-info-subtle text-info border-transparent",
  };
  return (
    <div
      className={cx(
        "rounded-md border px-3.5 py-3 text-sm",
        toneClass[tone],
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cx(title && "mt-0.5", "opacity-90")}>{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page furniture                                                             */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-ink sm:text-[1.4rem]">
          <span
            className="h-5 w-1 shrink-0 rounded-full bg-accent sm:h-6"
            aria-hidden
          />
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && (
          <p className="mt-1.5 pl-[0.9375rem] text-sm text-muted">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  loading?: boolean;
}) {
  // Statement-style card: a plain rounded panel, quiet grey label, bold value.
  // Tone tints the value only, so warnings/debts still read at a glance.
  const valueTone: Record<Tone, string> = {
    neutral: "text-ink",
    accent: "text-accent",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    info: "text-ink",
  };
  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.7rem] font-medium tracking-wider text-muted uppercase">
          {label}
        </p>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-8 w-24" />
      ) : (
        <p
          className={cx(
            "tnum mt-2 text-[1.7rem] leading-none font-semibold tracking-tight",
            valueTone[tone],
          )}
        >
          {value}
        </p>
      )}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Dark-active segmented control — the filter/mode switch used across the app. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-semibold transition-colors",
            size === "md" ? "px-3.5 py-1.5 text-sm" : "px-3 py-1 text-xs",
            value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:bg-subtle",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Amber section eyebrow with the little underline dash from the statements.
 * The one heading style used above every section of the app.
 */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-accent uppercase">
        {children}
      </p>
      <span className="mt-1 block h-0.5 w-6 rounded-full bg-accent/50" aria-hidden />
    </div>
  );
}

/** Horizontal rule with optional centred label. */
export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-line" />;
  return (
    <div className="flex items-center gap-3">
      <hr className="flex-1 border-line" />
      <span className="text-xs font-medium text-faint uppercase">{label}</span>
      <hr className="flex-1 border-line" />
    </div>
  );
}
