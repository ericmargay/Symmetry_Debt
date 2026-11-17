import { ArrowUpRight, Heart, MessageSquarePlus, Share2, Star, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { SupportLinks } from "@/components/shared/support-links";
import type { DonationLink } from "@/lib/site";
import { Container } from "./section";
import { ShareButton } from "./share-button";

const tileClass =
  "landing-lift group flex h-full w-full flex-col rounded-2xl border border-border bg-background p-5 outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TileBody({ icon: Icon, title, text, external }: { icon: LucideIcon; title: string; text: string; external?: string }) {
  return (
    <>
      <span className="flex items-center justify-between">
        <span className="grid size-10 place-items-center rounded-xl bg-secondary text-secondary-foreground transition-colors group-hover:bg-agreed-soft group-hover:text-agreed">
          <Icon className="size-5" aria-hidden />
        </span>
        {external && <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />}
      </span>
      <span className="mt-4 font-medium">{title}</span>
      <span className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</span>
      {external && <span className="sr-only">({external})</span>}
    </>
  );
}

/**
 * Section 10 — a calm, permanent invitation to support the project.
 *
 * Always there, never in the way: no pop-ups, nothing that insists. Ways to help that cost
 * nothing come first (a star, sharing, reporting a bug); voluntary donations appear only when
 * the instance has links configured, and happen entirely on the platform the visitor chooses.
 */
export function Support({ links, repoUrl }: { links: DonationLink[]; repoUrl: string }) {
  const t = useTranslations("landing.support");
  const issues = `${repoUrl.replace(/\/+$/, "")}/issues`;

  return (
    <section id="support" aria-labelledby="support-title" className="scroll-mt-16 py-16 sm:py-24">
      <Container>
        <div data-reveal className="relative overflow-hidden rounded-[2rem] border border-border bg-card px-6 py-10 sm:px-10 sm:py-12">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-owe/[0.06] blur-2xl" />
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12">
            <div>
              <span className="grid size-11 place-items-center rounded-full bg-owe-soft text-owe">
                <Heart className="size-5" aria-hidden />
              </span>
              <h2 id="support-title" className="mt-5 font-display text-[1.75rem] leading-tight font-medium sm:text-3xl">
                {t("title")}
              </h2>
              <p className="mt-3 max-w-lg text-[0.95rem] leading-relaxed text-muted-foreground">{links.length > 0 ? t("text") : t("textFree")}</p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-3">
              <li>
                <a href={repoUrl} target="_blank" rel="noopener noreferrer" className={tileClass}>
                  <TileBody icon={Star} title={t("ways.star.title")} text={t("ways.star.text")} external={t("newTab")} />
                </a>
              </li>
              <li>
                <ShareButton title={t("share.title")} text={t("share.text")} copiedLabel={t("share.copied")} className={tileClass}>
                  <TileBody icon={Share2} title={t("ways.share.title")} text={t("ways.share.text")} />
                </ShareButton>
              </li>
              <li>
                <a href={issues} target="_blank" rel="noopener noreferrer" className={tileClass}>
                  <TileBody icon={MessageSquarePlus} title={t("ways.improve.title")} text={t("ways.improve.text")} external={t("newTab")} />
                </a>
              </li>
            </ul>
          </div>

          {links.length > 0 && (
            <div className="mt-10 border-t border-border pt-8">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Heart className="size-4 text-owe" aria-hidden />
                {t("donateTitle")}
              </h3>
              <SupportLinks links={links} className="mt-4" />
              <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted-foreground">{t("external")}</p>
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
