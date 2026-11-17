"use client";

import { Eye, EyeOff, Landmark, Loader2, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteBankAccountAction, revealBankAccountAction, setPreferredBankAccountAction } from "@/actions/accounts";
import { AccountFormButton } from "@/components/accounts/account-form";
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
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" data-testid="bank-account">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground" aria-hidden>
          <Landmark className="size-[1.1rem]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="truncate">{account.alias}</span>
            {account.isPreferred && (
              <span className="inline-flex items-center gap-1 rounded-full bg-agreed-soft px-2 py-0.5 text-xs font-medium text-agreed">
                <Star className="size-3" aria-hidden />
                {t("preferred")}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            {account.bankName} · {account.currency}
          </p>
        </div>
      </header>

      <dl className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("holder")}</dt>
          <dd className="text-right font-medium">{account.holderName}</dd>
        </div>
        {(account.clabeLast4 || numbers?.clabe) && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("clabe")}</dt>
            <dd className="flex items-center gap-1 font-mono text-xs">
              {numbers?.clabe ? formatClabe(numbers.clabe) : maskLast4(account.clabeLast4)}
              {numbers?.clabe && <CopyButton value={numbers.clabe} label={t("copyClabe")} iconOnly variant="ghost" />}
            </dd>
          </div>
        )}
        {(account.accountLast4 || numbers?.accountNumber) && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t("account")}</dt>
            <dd className="flex items-center gap-1 font-mono text-xs">
              {numbers?.accountNumber ?? maskLast4(account.accountLast4)}
              {numbers?.accountNumber && <CopyButton value={numbers.accountNumber} label={t("copyAccount")} iconOnly variant="ghost" />}
            </dd>
          </div>
        )}
      </dl>

      <p className="text-xs text-muted-foreground">{account.sharedInAgreements > 0 ? t("sharedIn", { count: account.sharedInAgreements }) : t("notShared")}</p>

      <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
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
