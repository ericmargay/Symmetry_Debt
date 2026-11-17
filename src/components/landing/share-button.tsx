"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Shares the landing page: the system share sheet where there is one, otherwise the address is
 * copied. Nothing about the visitor is sent anywhere.
 */
export function ShareButton({
  title,
  text,
  copiedLabel,
  className,
  children,
}: {
  title: string;
  text: string;
  copiedLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2600);
    } catch {
      // Cancelled by the visitor, or the clipboard is not available: nothing to do.
    }
  }

  return (
    <button type="button" onClick={share} className={cn("text-left", className)}>
      {children}
      <span aria-live="polite" className={cn("mt-3 flex items-center gap-1.5 text-xs font-medium text-agreed", !copied && "sr-only")}>
        {copied && (
          <>
            <Check className="size-3.5" aria-hidden />
            {copiedLabel}
          </>
        )}
      </span>
    </button>
  );
}
