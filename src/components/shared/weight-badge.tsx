import { useTranslations } from "next-intl";
import { SymmetryMark, type MarkState } from "@/components/brand/symmetry-mark";
import { cn } from "@/lib/utils";

/**
 * How much weight a figure or an entry carries. This is the one distinction the whole product
 * exists to keep visible, so it always looks the same everywhere:
 *
 *   personal    ◖    slate    — written down by one person
 *   one_side    ◖◌   amber    — one side of an agreement said it, the other has not answered
 *   both_sides  ◖◗   teal     — both sides agree
 *   proposal    ◌◌   dashed   — nobody else has agreed to it yet
 */
export type Weight = "personal" | "one_side" | "both_sides" | "proposal";

const STYLES: Record<Weight, { mark: MarkState; className: string }> = {
  personal: { mark: "one", className: "bg-personal-soft text-personal" },
  one_side: { mark: "waiting", className: "bg-waiting-soft text-waiting" },
  both_sides: { mark: "both", className: "bg-agreed-soft text-agreed" },
  proposal: { mark: "none", className: "border border-dashed border-border bg-transparent text-muted-foreground" },
};

export function WeightBadge({
  weight,
  className,
  label,
  iconOnly = false,
}: {
  weight: Weight;
  className?: string;
  /** Overrides the default wording (e.g. "Saldo confirmado"). */
  label?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations("labels.weight");
  const style = STYLES[weight];
  const text = label ?? t(weight);
  return (
    <span
      title={t(`${weight}Hint`)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        style.className,
        iconOnly && "px-1.5",
        className,
      )}
    >
      <SymmetryMark state={style.mark} className="size-3.5" title={iconOnly ? text : undefined} />
      {!iconOnly && text}
    </span>
  );
}

export function WeightMark({ weight, className }: { weight: Weight; className?: string }) {
  const t = useTranslations("labels.weight");
  const style = STYLES[weight];
  return (
    <span title={t(`${weight}Hint`)} className={cn("inline-flex", style.className, "bg-transparent border-0", className)}>
      <SymmetryMark state={style.mark} className="size-4" title={t(weight)} />
    </span>
  );
}
