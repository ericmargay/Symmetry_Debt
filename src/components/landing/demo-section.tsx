import { useTranslations } from "next-intl";
import { Section, SectionHeading } from "./section";

/** Section 2 — frames the interactive demo (a client component passed in as children). */
export function DemoSection({ children }: { children: React.ReactNode }) {
  const t = useTranslations("landing.demo");

  return (
    <Section id="demo">
      <SectionHeading id="demo" index="02" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="mt-12">{children}</div>
    </Section>
  );
}
