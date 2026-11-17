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
        <div className="relative overflow-hidden rounded-[2rem] bg-agreed-soft px-6 py-14 text-center sm:px-12 sm:py-20">
          <SymmetryMark state="both" className="mx-auto size-12 text-agreed" />
          <h2 id="closing-title" className="mx-auto mt-6 max-w-2xl font-display text-[2rem] leading-[1.08] font-medium sm:text-5xl">
            {t("closing.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted-foreground">{t("closing.text")}</p>
          <Button asChild size="lg" className="mt-8">
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
