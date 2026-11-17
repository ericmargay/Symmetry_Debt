import { getLocale } from "next-intl/server";
import "./landing.css";
import { Closing } from "@/components/landing/closing";
import { Demo } from "@/components/landing/demo";
import { Faq } from "@/components/landing/faq";
import { Installments, Payments, PersonalTracking, Receipts, SharedAgreements } from "@/components/landing/features";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { Hero } from "@/components/landing/hero";
import { LandingEffects } from "@/components/landing/landing-effects";
import { LanguageHint } from "@/components/landing/language-hint";
import { OpenSource } from "@/components/landing/open-source";
import { Product } from "@/components/landing/product";
import { DemoSection } from "@/components/landing/demo-section";
import { Security } from "@/components/landing/security";
import { suggestedLocale } from "@/components/landing/suggest-locale";
import { Support } from "@/components/landing/support";
import { isLocale, defaultLocale } from "@/i18n/config";
import { translatorFor } from "@/i18n/messages";
import { donationLinks, repoUrl } from "@/lib/site";
import { getActor } from "@/server/session";

/**
 * Public landing page.
 *
 * Sections, in order: product · interactive demo · personal tracking · shared agreements ·
 * payments · instalments · receipts · security & privacy · open source · support (donation links
 * when the instance has them, otherwise ways to help that cost nothing) · FAQ.
 *
 * Motion (the 3D hero, scroll reveals, tilting cards) comes from `LandingEffects`, `HeroScene`
 * and app/landing.css, and stays out of the way of visitors who prefer reduced motion.
 */
export default async function LandingPage() {
  // The landing page must still render if the database is unreachable.
  const actor = await getActor().catch(() => null);
  const signedIn = actor !== null;

  const currentLocale = await getLocale();
  const locale = isLocale(currentLocale) ? currentLocale : defaultLocale;
  const offered = signedIn ? null : await suggestedLocale(locale);
  const hint = offered ? translatorFor(offered) : null;

  const links = donationLinks();
  const repo = repoUrl();

  return (
    <>
      {/* Target of "back to top": the header is sticky, so it cannot be the anchor itself. */}
      <div id="top" />
      {offered && hint && (
        <LanguageHint
          locale={offered}
          text={hint("locale.hint.text")}
          action={hint("locale.hint.action")}
          dismiss={hint("locale.hint.dismiss")}
        />
      )}
      <LandingHeader signedIn={signedIn} />
      <main id="content">
        <Hero signedIn={signedIn} repoUrl={repo} />
        <Product />
        <DemoSection>
          <Demo />
        </DemoSection>
        <PersonalTracking />
        <SharedAgreements />
        <Payments />
        <Installments />
        <Receipts />
        <Security />
        <OpenSource repoUrl={repo} />
        <Support links={links} repoUrl={repo} />
        <Faq />
        <Closing signedIn={signedIn} />
      </main>
      <LandingFooter repoUrl={repo} />
      <LandingEffects />
    </>
  );
}
