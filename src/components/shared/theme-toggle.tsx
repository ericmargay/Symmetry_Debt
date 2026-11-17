"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun },
  { value: "system", icon: Monitor },
  { value: "dark", icon: Moon },
] as const;

const subscribe = () => () => {};

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const { theme, setTheme } = useTheme();
  // The chosen theme is only known in the browser; render a neutral state on the server.
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);

  return (
    <div
      role="radiogroup"
      aria-label={t("label")}
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5", className)}
    >
      {OPTIONS.map(({ value, icon: Icon }) => {
        const selected = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(value)}
            title={t(value)}
            onClick={() => setTheme(value)}
            className={cn(
              "grid size-8 place-items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
