"use client";

import { Eye, EyeOff, Landmark, Loader2, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteBankAccountAction, revealBankAccountAction, setPreferredBankAccountAction } from "@/actions/accounts";
import { AccountFormButton } from "@/components/accounts/account-form";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { CopyButton } from "@/components/shared/copy-button";
import { ActionButton, ConfirmButton } from "@/components/shared/dialogs";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { formatClabe, maskLast4 } from "@/domain/clabe";

export interface AccountCardData {
  id: string;
  alias: string;
  bankName: string;
  holderName: string;
  clabeLast4: string | null;
  accountLast4: string | null;
  currency: string;
  isPreferred: boolean;
  sharedInAgreements: number;
}

/**
 * One saved account. Lists only ever carry the last four digits; the full numbers are fetched
 * from the server when the owner asks to see or copy them, and are dropped again on "hide".
 */
export function AccountCard({ account, defaultCurrency, defaultHolder }: { account: AccountCardData; defaultCurrency: string; defaultHolder: string }) {
  const t = useTranslations("accounts");
  const { run, pending } = useAction();
  const [numbers, setNumbers] = useState<{ clabe: string | null; accountNumber: string | null } | null>(null);

  const reveal = () => run(() => revealBankAccountAction(account.id), { onSuccess: setNumbers });
  const transferDetails = numbers
    ? [account.bankName, account.holderName, numbers.clabe ? `CLABE ${numbers.clabe}` : null, numbers.accountNumber ? `${t("account")} ${numbers.accountNumber}` : null].filter(Boolean).join("\n")
    : "";

  return (
    <article className="surface flex flex-col gap-4 p-3" data-testid="bank-account">
      {/* The account drawn as a card, the way banking apps show them. Only the last digits unless revealed. */}
      <div className="account-card relative isolate flex min-h-48 flex-col justify-between gap-5 overflow-hidden p-5">
        <SymmetryMark state="both" className="pointer-events-none absolute -right-10 -bottom-10 -z-10 size-40 text-white opacity-[0.07]" />
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <Landmark className="size-3.5" aria-hidden />
              {account.bankName}
            </p>
            <h2 className="mt-1 truncate font-display text-lg font-extrabold">{account.alias}</h2>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="rounded-full bg-white/12 px-2.5 py-1 text-xs font-bold">{account.currency}</span>
            {account.isPreferred && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-bold text-[var(--ink)]">
                <Star className="size-3" aria-hidden />
                {t("preferred")}
              </span>
            )}
          </div>
        </header>

        <dl className="flex flex-col gap-1.5">
          {(account.clabeLast4 || numbers?.clabe) && (
            <div className="flex items-center justify-between gap-3">
              <dt className="sr-only">{t("clabe")}</dt>
              <dd className="flex items-center gap-1 font-mono text-[1.05rem] font-semibold tracking-[0.08em] tabular">
                <span className="mr-2 font-sans text-[0.65rem] font-bold tracking-normal text-ink-muted" aria-hidden>
                  {t("clabe")}
                </span>
                {numbers?.clabe ? formatClabe(numbers.clabe) : maskLast4(account.clabeLast4)}
                {numbers?.clabe && <CopyButton value={numbers.clabe} label={t("copyClabe")} iconOnly variant="ghost" className="text-white hover:bg-white/15 hover:text-white" />}
              </dd>
            </div>
          )}
          {(account.accountLast4 || numbers?.accountNumber) && (
            <div className="flex items-center justify-between gap-3">
              <dt className="sr-only">{t("account")}</dt>
              <dd className="flex items-center gap-1 font-mono text-sm font-semibold tracking-[0.06em] tabular">
                <span className="mr-2 font-sans text-[0.65rem] font-bold tracking-normal text-ink-muted" aria-hidden>
                  {t("account")}
                </span>
                {numbers?.accountNumber ?? maskLast4(account.accountLast4)}
                {numbers?.accountNumber && <CopyButton value={numbers.accountNumber} label={t("copyAccount")} iconOnly variant="ghost" className="text-white hover:bg-white/15 hover:text-white" />}
              </dd>
            </div>
          )}
          <div className="flex items-end justify-between gap-3 pt-1">
            <dt className="sr-only">{t("holder")}</dt>
            <dd className="truncate text-sm font-semibold">{account.holderName}</dd>
          </div>
        </dl>
      </div>

      <p className="px-2 text-xs text-muted-foreground">{account.sharedInAgreements > 0 ? t("sharedIn", { count: account.sharedInAgreements }) : t("notShared")}</p>

      <footer className="flex flex-wrap gap-2 border-t border-border px-2 pt-3 pb-1">
        {numbers ? (
          <>
            <CopyButton value={transferDetails} label={t("copyAll")} variant="default" />
            <Button type="button" variant="outline" size="sm" onClick={() => setNumbers(null)}>
              <EyeOff aria-hidden />
              {t("hide")}
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled={pending} aria-busy={pending} onClick={reveal}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
            {t("show")}
          </Button>
        )}
        <AccountFormButton account={account} defaultCurrency={defaultCurrency} defaultHolder={defaultHolder} />
        {!account.isPreferred && (
          <ActionButton variant="ghost" size="sm" action={() => setPreferredBankAccountAction(account.id)}>
            <Star aria-hidden />
            {t("makePreferred")}
          </ActionButton>
        )}
        <ConfirmButton
          trigger={{ label: t("delete"), icon: <Trash2 aria-hidden />, variant: "ghost" }}
          title={t("deleteTitle")}
          description={t("deleteConfirm")}
          confirmLabel={t("delete")}
          destructive
          action={() => deleteBankAccountAction(account.id)}
        />
      </footer>
    </article>
  );
}
