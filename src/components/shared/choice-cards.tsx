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
      <legend className={cn("mb-2 text-sm font-medium", hideLegend && "sr-only")}>{legend}</legend>
      <div className={cn("grid gap-2.5", columns === 2 && "sm:grid-cols-2", columns === 3 && "sm:grid-cols-3")}>
        {choices.map((choice) => {
          const checked = choice.value === value;
          return (
            <label
              key={choice.value}
              className={cn(
                "relative flex cursor-pointer gap-3 rounded-xl border bg-card transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                compact ? "items-center px-3.5 py-2.5" : "flex-col p-4",
                checked ? "border-primary bg-secondary/50 ring-1 ring-primary" : "border-border hover:border-ring/60",
              )}
            >
              <input type="radio" name={name} value={choice.value} checked={checked} onChange={() => onChange(choice.value)} className="sr-only" />
              <span className={cn("flex gap-3", compact ? "items-center" : "items-start")}>
                {choice.icon && <span className={cn("shrink-0", checked ? "text-primary" : "text-muted-foreground")}>{choice.icon}</span>}
                <span className="min-w-0">
                  <span className="block text-sm leading-snug font-semibold">{choice.title}</span>
                  {choice.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{choice.description}</span>}
                </span>
              </span>
              {choice.extra}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
