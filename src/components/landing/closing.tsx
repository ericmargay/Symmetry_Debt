import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Button } from "@/components/ui/button";
import { Container } from "./section";

/** The last word before the footer: one sentence and the way in. */
export function Closing({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("landing");
  const nav = useTranslations("nav");

  return (
    <section aria-labelledby="closing-title" className="py-20 sm:py-28">
      <Container>
        <div data-reveal className="account-card relative isolate overflow-hidden px-6 py-14 text-center sm:px-12 sm:py-20">
          <SymmetryMark state="both" className="pointer-events-none absolute -bottom-24 -left-24 -z-10 size-80 text-white opacity-[0.06]" />
          <SymmetryMark state="both" className="mx-auto size-12 text-white" />
          <h2 id="closing-title" className="mx-auto mt-6 max-w-2xl font-display text-[2rem] leading-[1.08] font-extrabold tracking-tight sm:text-5xl">
            {t("closing.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-ink-muted">{t("closing.text")}</p>
          <Button asChild size="lg" className="landing-cta mt-8 bg-white text-[var(--ink)] shadow-[0_12px_30px_-12px_rgb(0_0_0/0.5)] hover:bg-white/90">
            <Link href={signedIn ? "/app" : "/login"}>
              {signedIn ? nav("goToApp") : t("hero.primaryCta")}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
