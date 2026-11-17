import { cn } from "@/lib/utils";

/**
 * The Symmetry mark: two halves of one circle.
 *
 * It is the logo, and it is also how the interface says how much weight something carries.
 * Each half is one side of an agreement; a half is filled when that side stands behind it.
 *
 *   one       ◖    only one person's word — a personal record
 *   waiting   ◖◌   one side recorded it, the other has not answered yet
 *   both      ◖◗   both sides agree
 *   none      ◌◌   nobody has agreed to this yet (a proposal)
 */
export type MarkState = "one" | "waiting" | "both" | "none";

const SOLID = "fill-current stroke-current";
const HOLLOW = "fill-none stroke-current opacity-55";

export function SymmetryMark({
  state = "both",
  className,
  title,
}: {
  state?: MarkState;
  className?: string;
  /** Accessible name. Omit when the mark sits next to text that says the same thing. */
  title?: string;
}) {
  const left = state === "none" ? HOLLOW : SOLID;
  const right = state === "both" ? SOLID : HOLLOW;
  const dashed = state === "waiting" || state === "none" ? "2.2 2.2" : undefined;

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {/* left half */}
      <path d="M10.6 3.2a8.8 8.8 0 0 0 0 17.6Z" className={left} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray={state === "none" ? "2.2 2.2" : undefined} />
      {/* right half — absent for a personal record: there is no other side */}
      {state !== "one" && (
        <path d="M13.4 3.2a8.8 8.8 0 0 1 0 17.6Z" className={right} strokeWidth="1.5" strokeLinejoin="round" strokeDasharray={dashed} />
      )}
    </svg>
  );
}
