import { Coffee, ExternalLink, Heart, Wallet } from "lucide-react";
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
