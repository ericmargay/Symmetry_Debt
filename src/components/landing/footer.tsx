import { ArrowUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { GithubIcon } from "@/components/brand/github-icon";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LANDING_ANCHORS } from "./header";
import { Container } from "./section";

const linkClass =
  "inline-flex min-h-10 items-center gap-2 rounded-md text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function LandingFooter({ repoUrl }: { repoUrl: string }) {
  const t = useTranslations("landing");

  return (
    <footer className="border-t border-border bg-card">
      <Container className="py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p lang="en" className="mt-4 font-display text-lg leading-snug">
              {t("hero.motto")}
            </p>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{t("footer.description")}</p>
          </div>

          <nav aria-label={t("footer.navLabel")} className="contents">
            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{t("footer.sections")}</h2>
              <ul className="mt-3 text-sm">
                {LANDING_ANCHORS.map((item) => (
                  <li key={item.key}>
                    <a href={item.href} className={linkClass}>
                      {t(`header.nav.${item.key}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{t("footer.project")}</h2>
              <ul className="mt-3 text-sm">
                <li>
                  <a href={repoUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    <GithubIcon />
                    {t("footer.source")}
                  </a>
                </li>
                <li className="flex min-h-10 items-center text-muted-foreground">{t("footer.license")}</li>
                <li>
                  <a href="#support" className={linkClass}>
                    {t("footer.support")}
                  </a>
                </li>
              </ul>
            </div>
          </nav>

          <div>
            <h2 className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">{t("footer.preferences")}</h2>
            {/* Full-size touch targets on phones; the compact controls from sm up. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <LanguageSwitch className="max-sm:[&_button]:min-h-10 max-sm:[&_button]:min-w-10" />
              <ThemeToggle className="max-sm:[&_button]:p-[0.8125rem]" />
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.free")}</p>
          <a href="#top" className={linkClass}>
            <ArrowUp className="size-4" aria-hidden />
            {t("footer.backToTop")}
          </a>
        </div>
      </Container>
    </footer>
  );
}
