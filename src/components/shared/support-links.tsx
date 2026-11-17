import { Coffee, ExternalLink, Heart, MessageSquarePlus, Star, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { GithubIcon } from "@/components/brand/github-icon";
import type { DonationLink } from "@/lib/site";
import { cn } from "@/lib/utils";

const ICONS = { github: GithubIcon, kofi: Coffee, buymeacoffee: Coffee, paypal: Wallet, other: Heart } as const;

/**
 * The configured donation links, as plain external links. Donations happen entirely on the
 * platform the person chooses; the app never handles payments or card data.
 * Renders nothing when the instance has no links configured.
 */
export function SupportLinks({ links, className }: { links: DonationLink[]; className?: string }) {
  const t = useTranslations("donate");
  if (links.length === 0) return null;

  return (
    <ul className={cn("flex flex-wrap gap-2", className)}>
      {links.map((link) => {
        const Icon = ICONS[link.id];
        const label = link.id === "other" ? link.label : t(`platform.${link.id}`);
        return (
          <li key={`${link.id}-${link.url}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              {label}
              <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
              <span className="sr-only">({t("opensNewTab")})</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Ways to help that cost nothing, always available: they point at the project's repository.
 * Shown next to the donation links, or on their own when the instance has none configured.
 */
export function SupportWays({ repoUrl, className }: { repoUrl: string; className?: string }) {
  const t = useTranslations("donate.ways");
  const base = repoUrl.replace(/\/+$/, "");
  const ways = [
    { key: "star", href: base, icon: Star },
    {
      key: "issue",
      href: `${base}/issues/new/choose`,
      icon: MessageSquarePlus,
    },
    {
      key: "contribute",
      href: `${base}/blob/main/CONTRIBUTING.md`,
      icon: GithubIcon,
    },
  ] as const;

  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {ways.map(({ key, href, icon: Icon }) => (
        <li key={key}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2 text-sm transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden />
            <span className="flex-1">{t(key)}</span>
            <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
            <span className="sr-only">({t("opensNewTab")})</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
