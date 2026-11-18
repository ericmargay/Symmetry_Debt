import { cn } from "@/lib/utils";
import { SymmetryMark } from "./symmetry-mark";

/** Mark + wordmark. The name is a proper noun and is not translated. */
export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)}>
      <SymmetryMark state="both" className="size-6 text-primary" />
      {!compact && (
        <span className="font-display text-[1.15rem] leading-none font-extrabold tracking-tight">
          Symmetry <span className="text-primary">Debt</span>
        </span>
      )}
      {compact && <span className="sr-only">Symmetry Debt</span>}
    </span>
  );
}
