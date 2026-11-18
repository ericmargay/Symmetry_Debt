import { cn } from "@/lib/utils";

/**
 * Confirmation, read like a message receipt — the idiom everybody already knows:
 *
 *   personal   ✓   slate    recorded by you only (a personal record)
 *   one        ✓   grey     marked by one side, waiting for the other
 *   both       ✓✓  indigo   validated by both sides
 *   rejected   ✕   red      the other side said it did not happen
 */
export type TickState = "personal" | "one" | "both" | "rejected";

const COLORS: Record<TickState, string> = {
  personal: "text-personal",
  one: "text-muted-foreground",
  both: "text-agreed",
  rejected: "text-destructive",
};

export function Ticks({ state, label, className }: { state: TickState; label?: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <span className={cn("inline-flex shrink-0 items-center", COLORS[state], className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {state === "both" ? (
        <svg viewBox="0 0 22 16" className="h-[0.85em] w-[1.2em]" focusable="false">
          <path d="M1.6 8.6l3.4 3.4L12.4 4.4" {...common} />
          <path d="M8.4 11.4l.6.6L16.4 4.4" {...common} />
        </svg>
      ) : state === "rejected" ? (
        <svg viewBox="0 0 16 16" className="h-[0.85em] w-[0.85em]" focusable="false">
          <path d="M4 4l8 8M12 4l-8 8" {...common} />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-[0.85em] w-[0.9em]" focusable="false">
          <path d="M2.6 8.6l3.4 3.4L13.4 4.4" {...common} />
        </svg>
      )}
    </span>
  );
}
