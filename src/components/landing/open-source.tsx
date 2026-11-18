import { Container as ContainerIcon, Gift, Languages, Unplug, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GithubIcon } from "@/components/brand/github-icon";
import { Button } from "@/components/ui/button";
import { Section, SectionHeading } from "./section";

const POINTS: ReadonlyArray<{ key: "p1" | "p2" | "p3" | "p4"; icon: LucideIcon }> = [
  { key: "p1", icon: Gift },
  { key: "p2", icon: ContainerIcon },
  { key: "p3", icon: Unplug },
  { key: "p4", icon: Languages },
];

/** What the project is built with. Proper nouns: the same in every language. */
const STACK = ["MIT", "Next.js", "PostgreSQL", "Docker"] as const;

/** Section 9 — why the code is open, and where it is. */
export function OpenSource({ repoUrl }: { repoUrl: string }) {
  const t = useTranslations("landing.openSource");

  return (
    <Section id="open-source">
      <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
        <div>
          <SectionHeading id="open-source" index="09" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
          <div data-reveal className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-4">
            <Button asChild size="lg" variant="outline">
              <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                <GithubIcon data-icon="inline-start" />
                {t("cta")}
              </a>
            </Button>
          </div>
          <ul data-reveal aria-label={t("stackLabel")} className="mt-7 flex flex-wrap gap-2">
            {STACK.map((item) => (
              <li
                key={item}
                className="rounded-md border border-border bg-card px-2.5 py-1 font-mono text-xs tracking-tight text-muted-foreground"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <ul className="grid gap-5 sm:grid-cols-2">
          {POINTS.map(({ key, icon: Icon }) => (
            <li key={key} data-reveal className="landing-lift group rounded-3xl border border-border bg-card p-6">
              <Icon className="size-6 text-primary transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" aria-hidden />
              <h3 className="mt-4 font-display text-xl leading-snug font-extrabold tracking-tight">{t(`${key}.title`)}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{t(`${key}.text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
