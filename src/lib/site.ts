import "server-only";

/**
 * Instance-level configuration that pages need: where the source code lives and which
 * voluntary donation links (if any) this instance wants to show.
 *
 * Nothing here is required. An instance with no donation links simply shows none, and no
 * instance depends on the original developer's accounts.
 */

export const UPSTREAM_REPO_URL = "https://github.com/ericmargay/Symmetry_Debt";

export interface DonationLink {
  id: "github" | "kofi" | "buymeacoffee" | "paypal" | "other";
  /** Shown as-is for "other"; the known platforms are named by the interface. */
  label: string;
  url: string;
}

function validUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function repoUrl(): string {
  return validUrl(process.env.PROJECT_REPO_URL) ?? UPSTREAM_REPO_URL;
}

/** Only the platforms whose links were configured. Donations are never processed by the app. */
export function donationLinks(): DonationLink[] {
  const links: DonationLink[] = [];
  const add = (id: DonationLink["id"], label: string, value: string | undefined) => {
    const url = validUrl(value);
    if (url) links.push({ id, label, url });
  };

  add("github", "GitHub Sponsors", process.env.DONATE_GITHUB_SPONSORS_URL);
  add("kofi", "Ko-fi", process.env.DONATE_KOFI_URL);
  add("buymeacoffee", "Buy Me a Coffee", process.env.DONATE_BUYMEACOFFEE_URL);
  add("paypal", "PayPal", process.env.DONATE_PAYPAL_URL);

  // Extra links: "Label|https://…;Other label|https://…"
  for (const entry of (process.env.DONATE_OTHER_LINKS ?? "").split(";")) {
    const separator = entry.indexOf("|");
    if (separator === -1) continue;
    const label = entry.slice(0, separator).trim().slice(0, 40);
    if (label) add("other", label, entry.slice(separator + 1));
  }
  return links;
}

export function donationsEnabled(): boolean {
  return donationLinks().length > 0;
}
