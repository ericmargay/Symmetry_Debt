import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { SupportLinks } from "@/components/shared/support-links";
import type { DonationLink } from "@/lib/site";
import { Container } from "./section";

/**
 * Section 10 — a quiet, permanent invitation to support the project.
 *
 * It only exists when the instance has donation links configured, it never pops up or insists,
 * and the links are revealed by the reader with a native disclosure (no script involved).
 * Donations happen on the chosen platform; the app handles no payments.
 */
export function Support({ links }: { links: DonationLink[] }) {
  const t = useTranslations("landing.support");
  if (links.length === 0) return null;

  return (
    <section id="support" aria-labelledby="support-title" className="scroll-mt-16 py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card px-6 py-9 text-center sm:px-10">
          <Heart className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <h2 id="support-title" className="mt-4 font-display text-2xl leading-snug font-medium">
            {t("title")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-muted-foreground">{t("text")}</p>

          <details className="group mt-6">
            <summary className="mx-auto inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <Heart className="size-4 text-muted-foreground" aria-hidden />
              {t("button")}
            </summary>
            <div className="mt-6">
              <SupportLinks links={links} className="justify-center" />
              <p className="mx-auto mt-4 max-w-md text-xs leading-relaxed text-muted-foreground">{t("external")}</p>
            </div>
          </details>
        </div>
      </Container>
    </section>
  );
}
