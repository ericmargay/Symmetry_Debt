import { useTranslations } from "next-intl";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Section, SectionHeading } from "./section";

const QUESTIONS = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"] as const;

/** Section 11 — frequently asked questions. */
export function Faq() {
  const t = useTranslations("landing.faq");

  return (
    <Section id="faq" tone="band">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <SectionHeading id="faq" index="11" eyebrow={t("eyebrow")} title={t("title")} className="lg:sticky lg:top-28 lg:self-start" />
        <Accordion type="single" collapsible className="rounded-3xl border border-border bg-background px-5 sm:px-7">
          {QUESTIONS.map((key) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="min-h-14 items-center gap-4 py-4 text-base leading-snug">{t(`${key}.q`)}</AccordionTrigger>
              <AccordionContent className="pb-5 text-[0.95rem] leading-relaxed text-muted-foreground">{t(`${key}.a`)}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}
