"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies a value to the clipboard and says so (also to screen readers). */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "outline",
  className,
  iconOnly = false,
}: {
  value: string;
  label?: string;
  size?: "sm" | "default" | "icon-sm";
  variant?: "outline" | "ghost" | "secondary" | "default";
  className?: string;
  iconOnly?: boolean;
}) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const Icon = copied ? Check : Copy;
  return (
    <Button type="button" size={iconOnly ? "icon-sm" : size} variant={variant} onClick={copy} className={className} aria-label={iconOnly ? (label ?? t("copy")) : undefined}>
      <Icon aria-hidden />
      {!iconOnly && (copied ? t("copied") : (label ?? t("copy")))}
    </Button>
  );
}
