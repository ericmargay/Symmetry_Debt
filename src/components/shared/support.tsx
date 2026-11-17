"use client";

import { Heart } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useContext, useState } from "react";
import { SupportLinks } from "@/components/shared/support-links";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { DonationLink } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * Voluntary support for the project, inside the app.
 *
 * Present, never pushy: the dialog only ever opens because somebody clicked a link to it.
 * Nothing here appears while approving, recording a payment or doing anything else that
 * matters, and when the instance has no donation links configured none of it renders at all.
 */
const SupportContext = createContext<{ enabled: boolean; open: () => void }>({ enabled: false, open: () => {} });

export function SupportProvider({ links, children }: { links: DonationLink[]; children: React.ReactNode }) {
  const t = useTranslations("donate");
  const [isOpen, setOpen] = useState(false);
  const enabled = links.length > 0;

  return (
    <SupportContext.Provider value={{ enabled, open: () => setOpen(true) }}>
      {children}
      {enabled && (
        <Dialog open={isOpen} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Heart className="size-4 text-owe" aria-hidden />
                {t("title")}
              </DialogTitle>
              <DialogDescription>{t("lead")}</DialogDescription>
            </DialogHeader>
            <SupportLinks links={links} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("optional")} {t("external")}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </SupportContext.Provider>
  );
}

export function useSupport() {
  return useContext(SupportContext);
}

/** "♡ Apoyar Symmetry Debt" — a quiet secondary action. Renders nothing without links. */
export function SupportTrigger({ className, children }: { className?: string; children?: React.ReactNode }) {
  const t = useTranslations("donate");
  const { enabled, open } = useSupport();
  if (!enabled) return null;
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        "inline-flex items-center gap-2 rounded-md text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Heart className="size-3.5" aria-hidden />
      {children ?? t("sidebar")}
    </button>
  );
}

/**
 * The occasional contextual mention, for empty states and "all done" screens only.
 * One small line of text; it never moves the task out of the way.
 */
export function SupportHint({ className }: { className?: string }) {
  const t = useTranslations("donate");
  const { enabled, open } = useSupport();
  if (!enabled) return null;
  return (
    <p className={cn("text-xs leading-relaxed text-muted-foreground", className)}>
      {t("contextual")}{" "}
      <button type="button" onClick={open} className="rounded underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
        {t("title")}
      </button>
    </p>
  );
}
