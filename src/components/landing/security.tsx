import {
  Download,
  EyeOff,
  History,
  KeyRound,
  LockKeyhole,
  MailX,
  MegaphoneOff,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Section, SectionHeading } from "./section";

const ITEMS: ReadonlyArray<{ key: "i1" | "i2" | "i3" | "i4" | "i5" | "i6" | "i7" | "i8"; icon: LucideIcon }> = [
  { key: "i1", icon: EyeOff },
  { key: "i2", icon: MailX },
  { key: "i3", icon: UsersRound },
  { key: "i4", icon: LockKeyhole },
  { key: "i5", icon: History },
  { key: "i6", icon: Download },
  { key: "i7", icon: KeyRound },
  { key: "i8", icon: MegaphoneOff },
];

/** Section 8 — what the app guarantees about privacy. Every line here is enforced in code. */
export function Security() {
  const t = useTranslations("landing.security");

  return (
    <Section id="security" tone="band">
      <SectionHeading id="security" index="08" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <ul data-reveal className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map(({ key, icon: Icon }) => (
          <li key={key} className="group bg-background p-6 transition-colors duration-300 hover:bg-card sm:p-7">
            <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-[background-color,color,translate] duration-300 group-hover:-translate-y-0.5 group-hover:bg-agreed-soft group-hover:text-agreed">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-5 leading-snug font-medium">{t(`${key}.title`)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(`${key}.text`)}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
