import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type AvatarTone = "owe" | "owed" | "primary" | "neutral";

const TONES: Record<AvatarTone, string> = {
  owe: "bg-owe-soft text-owe",
  owed: "bg-owed-soft text-owed",
  primary: "bg-secondary text-secondary-foreground",
  neutral: "bg-muted text-muted-foreground",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "·";
}

/**
 * The person on the other side, the way a banking app shows a contact: a round tile with their
 * initials. With `direction`, a small badge says which way the money goes.
 */
export function InitialAvatar({
  name,
  tone = "primary",
  direction,
  className,
}: {
  name: string;
  tone?: AvatarTone;
  /** "out": I owe them · "in": they owe me. */
  direction?: "out" | "in";
  className?: string;
}) {
  return (
    <span className={cn("relative grid size-10 shrink-0 place-items-center rounded-full font-display text-sm font-bold", TONES[tone], className)} aria-hidden>
      {initials(name)}
      {direction && (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 grid size-[1.1rem] place-items-center rounded-full ring-2 ring-card",
            direction === "out" ? "bg-owe text-white" : "bg-owed text-white",
          )}
        >
          {direction === "out" ? <ArrowUpRight className="size-3" strokeWidth={2.6} /> : <ArrowDownLeft className="size-3" strokeWidth={2.6} />}
        </span>
      )}
    </span>
  );
}
