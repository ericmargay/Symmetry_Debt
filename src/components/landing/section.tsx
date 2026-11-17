import { Check, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** Page-width wrapper shared by every block of the landing page. */
export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>{children}</div>;
}

/**
 * One section of the page. `id` is the anchor used by the navigation and also names the
 * heading (`<id>-title`) the section is labelled by.
 */
export function Section({
  id,
  tone = "plain",
  className,
  children,
}: {
  id: string;
  /** "band" sets the section apart on a card-coloured strip. */
  tone?: "plain" | "band";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-16 py-20 sm:py-28", tone === "band" && "border-y border-border bg-card", className)}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function SectionHeading({
  id,
  index,
  eyebrow,
  title,
  lead,
  className,
}: {
  id: string;
  /** Editorial numbering ("01"). Decorative. */
  index: string;
  eyebrow: string;
  title: string;
  lead?: string;
  className?: string;
}) {
  return (
    <div data-reveal className={cn("max-w-2xl", className)}>
      <p className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-primary uppercase">
        <span aria-hidden className="tabular text-muted-foreground">
          {index}
        </span>
        <span aria-hidden className="landing-bar h-px w-8 bg-primary/40" />
        {eyebrow}
      </p>
      <h2 id={`${id}-title`} className="mt-5 font-display text-[2rem] leading-[1.08] font-medium sm:text-4xl lg:text-[2.75rem]">
        {title}
      </h2>
      {lead && <p className="mt-5 text-lg leading-relaxed text-pretty text-muted-foreground">{lead}</p>}
    </div>
  );
}

/** Icon + title + sentence. Rendered inside a <ul>. Reveals on scroll; the icon answers hover. */
export function FeatureItem({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <li data-reveal className="group flex gap-4">
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-[background-color,color,translate,rotate] duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-3 group-hover:bg-agreed-soft group-hover:text-agreed">
        <Icon className="size-5" aria-hidden />
      </span>
      <div>
        <h3 className="leading-snug font-medium">{title}</h3>
        <p className="mt-1 text-[0.95rem] leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

/** A sentence with a check mark. Rendered inside a <ul>. */
export function CheckLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <li data-reveal className={cn("flex gap-3 text-[0.95rem] leading-relaxed", className)}>
      <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** Caption under every illustration that shows sample figures. */
export function ExampleCaption({ className }: { className?: string }) {
  const t = useTranslations("landing");
  return <p className={cn("mt-3 text-center text-xs text-muted-foreground", className)}>{t("example")}</p>;
}

/** Small pill used inside the illustrations for states such as "Active" or "To be confirmed". */
export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "personal" | "agreed" | "waiting" | "owe";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-none font-medium whitespace-nowrap",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "personal" && "bg-personal-soft text-personal",
        tone === "agreed" && "bg-agreed-soft text-agreed",
        tone === "waiting" && "bg-waiting-soft text-foreground",
        tone === "owe" && "bg-owe-soft text-owe",
        className,
      )}
    >
      {children}
    </span>
  );
}
