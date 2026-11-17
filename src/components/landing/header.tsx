import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Container } from "./section";

/**
 * Anchors of the sections the page links to (ids are language-neutral on purpose).
 * The header shows the short list; the footer shows all of them.
 */
export const LANDING_ANCHORS = [
  { key: "product", href: "#product", header: true },
  { key: "demo", href: "#demo", header: true },
  { key: "features", href: "#personal", header: false },
  { key: "security", href: "#security", header: true },
  { key: "openSource", href: "#open-source", header: true },
  { key: "faq", href: "#faq", header: true },
] as const;

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("landing.header");

  return (
    <header
      className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-md supports-[backdrop-filter]:bg-background/75"
    >
      <Container className="flex h-16 items-center justify-between gap-3">
        <Link
          href="/"
          aria-label={t("home")}
          className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          {/* The wordmark gives way to the mark alone where the header would not fit it:
              the narrowest phones, and a little earlier when the button says "Dashboard". */}
          <Logo className={signedIn ? "whitespace-nowrap max-[439px]:hidden" : "whitespace-nowrap max-[389px]:hidden"} />
          <Logo compact className={signedIn ? "min-[440px]:hidden" : "min-[390px]:hidden"} />
        </Link>

        <nav aria-label={t("navLabel")} className="hidden xl:block">
          <ul className="flex items-center text-sm">
            {LANDING_ANCHORS.filter((item) => item.header).map((item) => (
              <li key={item.key}>
                <a
                  href={item.href}
                  className="inline-flex min-h-10 items-center rounded-md px-3 whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(`nav.${item.key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <LanguageSwitch className="hidden sm:inline-flex" />
          {/* On phones the two language buttons get a full-size touch target. */}
          <LanguageSwitch variant="menu" className="sm:hidden [&_button]:min-h-10 [&_button]:min-w-10" />
          <Button asChild size="sm" className="max-sm:h-10">
            <Link href={signedIn ? "/app" : "/login"}>{signedIn ? t("dashboard") : t("signIn")}</Link>
          </Button>
        </div>
      </Container>
    </header>
  );
}
