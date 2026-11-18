"use client";

import { cn } from "@/lib/utils";

export interface Choice<T extends string> {
  value: T;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  extra?: React.ReactNode;
}

/** A radio group drawn as cards. Real radio inputs underneath: keyboard and screen readers just work. */
export function ChoiceCards<T extends string>({
  name,
  legend,
  value,
  onChange,
  choices,
  columns = 2,
  compact = false,
  hideLegend = false,
}: {
  name: string;
  legend: string;
  value: T | "";
  onChange: (value: T) => void;
  choices: Choice<T>[];
  columns?: 1 | 2 | 3;
  compact?: boolean;
  hideLegend?: boolean;
}) {
  return (
    <fieldset>
      <legend className={cn("mb-2 text-sm font-semibold", hideLegend && "sr-only")}>{legend}</legend>
      <div className={cn("grid gap-3", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {choices.map((choice) => {
          const checked = choice.value === value;
          return (
            <label
              key={choice.value}
              className={cn(
                "relative flex cursor-pointer gap-3 rounded-2xl border-2 bg-card transition-all has-focus-visible:ring-2 has-focus-visible:ring-ring",
                compact ? "items-center px-3.5 py-3" : "flex-col p-5",
                checked ? "border-primary shadow-[0_10px_28px_-16px_var(--primary)]" : "border-border hover:border-ring/50",
              )}
            >
              <input type="radio" name={name} value={choice.value} checked={checked} onChange={() => onChange(choice.value)} className="sr-only" />
              <span className={cn("flex gap-3.5 pr-7", compact ? "items-center" : "items-start")}>
                {choice.icon && (
                  <span
                    className={cn(
                      "grid shrink-0 place-items-center rounded-2xl transition-colors",
                      compact ? "size-10" : "size-12",
                      checked ? "bg-secondary text-primary" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {choice.icon}
                  </span>
                )}
                <span className="min-w-0">
                  <span className={cn("block leading-snug font-bold", compact ? "text-sm" : "text-[0.95rem]")}>{choice.title}</span>
                  {choice.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{choice.description}</span>}
                </span>
              </span>
              <span
                className={cn(
                  "absolute grid size-5 place-items-center rounded-full border-2 transition-colors",
                  compact ? "top-1/2 right-3.5 -translate-y-1/2" : "top-4 right-4",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                )}
                aria-hidden
              >
                {checked && (
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                )}
              </span>
              {choice.extra}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
