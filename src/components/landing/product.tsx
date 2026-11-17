import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { SymmetryMark, type MarkState } from "@/components/brand/symmetry-mark";
import { cn } from "@/lib/utils";
import { CheckLine, Section, SectionHeading } from "./section";

const LEGEND: ReadonlyArray<{ state: MarkState; color: string }> = [
  { state: "one", color: "text-personal" },
  { state: "waiting", color: "text-waiting" },
  { state: "both", color: "text-agreed" },
  { state: "none", color: "text-muted-foreground" },
];

/** Section 1 — what the product is: two ways to keep a debt, and the symbol that tells them apart. */
export function Product() {
  const t = useTranslations("landing.product");
  const legend = useTranslations("landing.legend");

  return (
    <Section id="product" tone="band">
      <SectionHeading id="product" index="01" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <ModeCard
          tone="personal"
          mark="one"
          kicker={t("personal.kicker")}
          title={t("personal.title")}
          text={t("personal.text")}
          points={[t("personal.p1"), t("personal.p2"), t("personal.p3")]}
        />
        <ModeCard
          tone="agreed"
          mark="both"
          kicker={t("shared.kicker")}
          title={t("shared.title")}
          text={t("shared.text")}
          points={[t("shared.p1"), t("shared.p2"), t("shared.p3")]}
        />
      </div>

      <p className="mt-6 flex items-start gap-3 text-[0.95rem] leading-relaxed text-muted-foreground sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-primary">
          <ArrowLeftRight className="size-4" aria-hidden />
        </span>
        {t("bridge")}
      </p>

      <div className="mt-14 rounded-3xl border border-border bg-background p-6 sm:p-9">
        <div className="max-w-2xl">
          <h3 className="font-display text-2xl leading-snug font-medium">{legend("title")}</h3>
          <p className="mt-2 leading-relaxed text-muted-foreground">{legend("lead")}</p>
        </div>
        <ul className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {LEGEND.map(({ state, color }) => (
            <li key={state} className="flex gap-4 lg:flex-col lg:gap-3">
              <SymmetryMark state={state} className={cn("size-11 shrink-0", color)} />
              <div>
                <p className="font-medium">{legend(`${state}.name`)}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{legend(`${state}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function ModeCard({
  tone,
  mark,
  kicker,
  title,
  text,
  points,
}: {
  tone: "personal" | "agreed";
  mark: MarkState;
  kicker: string;
  title: string;
  text: string;
  points: string[];
}) {
  return (
    <article className="relative overflow-hidden rounded-3xl border border-border bg-background p-7 sm:p-9">
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-1", tone === "personal" ? "bg-personal" : "bg-agreed")} />
      <div className="flex items-start justify-between gap-4">
        <p className={cn("text-xs font-semibold tracking-[0.18em] uppercase", tone === "personal" ? "text-personal" : "text-agreed")}>
          {kicker}
        </p>
        <SymmetryMark state={mark} className={cn("size-12", tone === "personal" ? "text-personal" : "text-agreed")} />
      </div>
      <h3 className="mt-2 font-display text-[1.75rem] leading-tight font-medium">{title}</h3>
      <p className="mt-3 leading-relaxed text-muted-foreground">{text}</p>
      <ul className="mt-6 space-y-2.5">
        {points.map((point) => (
          <CheckLine key={point}>{point}</CheckLine>
        ))}
      </ul>
    </article>
  );
}
