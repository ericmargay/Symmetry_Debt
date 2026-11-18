"use client";

import { ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { proposeConversionAction, type CreatedDebt } from "@/actions/debts";
import { ShareLinkPanel } from "@/components/debts/share-link";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { DateText } from "@/components/shared/dates";
import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { WeightBadge } from "@/components/shared/weight-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";

export interface ConvertiblePayment {
  id: string;
  amountMinor: bigint;
  effectiveDate: string;
  method: string | null;
  receipts: number;
}

/**
 * "Invitar a confirmar esta deuda".
 *
 * The owner decides what leaves their private record: either the amount plus the payments they
 * tick, or just today's balance with no history. Notes and receipts stay private unless they
 * are explicitly included. What the other person will see is previewed before anything is sent.
 */
export function ConversionForm({
  debtId,
  counterpartyName,
  currency,
  totalOwedMinor,
  outstandingMinor,
  payments,
  debtReceipts,
  hasNotes,
  suggestedEmail,
  canShareAccount,
  accounts,
}: {
  debtId: string;
  counterpartyName: string;
  currency: string;
  totalOwedMinor: bigint;
  outstandingMinor: bigint;
  payments: ConvertiblePayment[];
  debtReceipts: number;
  hasNotes: boolean;
  suggestedEmail: string | null;
  canShareAccount: boolean;
  accounts: Array<{ id: string; alias: string; label: string }>;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const { run, pending, fieldMessage } = useAction();
  const [history, setHistory] = useState<"FULL_HISTORY" | "BALANCE_ONLY">("FULL_HISTORY");
  const [selected, setSelected] = useState<string[]>(payments.map((payment) => payment.id));
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeReceipts, setIncludeReceipts] = useState(false);
  const [email, setEmail] = useState(suggestedEmail ?? "");
  const [emailError, setEmailError] = useState<string>();
  const [accountId, setAccountId] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [done, setDone] = useState<CreatedDebt | null>(null);

  const full = history === "FULL_HISTORY";
  const chosen = payments.filter((payment) => selected.includes(payment.id));
  const recognised = chosen.reduce((sum, payment) => sum + payment.amountMinor, 0n);
  const proposedAmount = full ? totalOwedMinor : outstandingMinor;
  const opening = full ? totalOwedMinor - recognised : outstandingMinor;
  const receiptCount = debtReceipts + (full ? chosen.reduce((sum, payment) => sum + payment.receipts, 0) : 0);
  const notShared = payments.length - chosen.length;
  // Everything cannot be recognised as paid: there has to be something left to agree on.
  const invalid = full && opening <= 0n;

  if (done) {
    return (
      <div className="surface mx-auto max-w-xl p-6 sm:p-9">
        <span className="grid size-11 place-items-center rounded-full bg-agreed-soft text-agreed" aria-hidden>
          <Check className="size-5" />
        </span>
        <h2 className="mt-4 font-display text-[1.6rem] font-extrabold tracking-tight">{t("convert.doneTitle")}</h2>
        {done.inviteToken ? (
          <>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">{t("convert.doneText", { name: counterpartyName })}</p>
            <ShareLinkPanel token={done.inviteToken} emailedTo={done.emailedTo} />
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("wizard.done.sentDirect", { name: counterpartyName })}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/app/debts/${done.debtId}`}>
              {t("convert.goToProposal")}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/app/debts/${debtId}`}>{t("convert.backToRecord")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="surface mx-auto flex max-w-2xl flex-col gap-6 p-5 sm:p-8"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            proposeConversionAction(debtId, {
              idempotencyKey,
              history,
              paymentIds: full ? selected : [],
              includeNotes,
              includeReceipts,
              inviteEmail: email.trim() || null,
              shareAccountId: canShareAccount ? accountId || null : null,
            }),
          {
            onSuccess: setDone,
            onError: (failure) => {
              if (failure.fields?.inviteEmail) setEmailError(fieldMessage(failure.fields.inviteEmail));
              return false;
            },
          },
        );
      }}
    >
      <p className="flex gap-2.5 rounded-xl bg-secondary/60 px-3.5 py-3 text-sm leading-relaxed text-secondary-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("convert.safe", { name: counterpartyName })}
      </p>

      <ChoiceCards
        name="history"
        legend={t("convert.historyQuestion")}
        value={history}
        onChange={setHistory}
        choices={[
          { value: "FULL_HISTORY", title: t("convert.full"), description: t("convert.fullHint") },
          { value: "BALANCE_ONLY", title: t("convert.balanceOnly"), description: t("convert.balanceOnlyHint", { amount: formatMoney(outstandingMinor, currency, intlLocales[locale] ?? intlLocales.es) }) },
        ]}
      />

      {full && (
        <fieldset>
          <legend className="text-sm font-semibold">{t("convert.payments")}</legend>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">{t("convert.paymentsHint", { name: counterpartyName })}</p>
          {payments.length === 0 ? (
            <p className="rounded-2xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("convert.noPayments")}</p>
          ) : (
            <>
              <div className="mb-2 flex gap-3 text-xs">
                <button type="button" className="rounded text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected(payments.map((payment) => payment.id))}>
                  {t("convert.selectAll")}
                </button>
                <button type="button" className="rounded text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setSelected([])}>
                  {t("convert.selectNone")}
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {payments.map((payment) => {
                  const checked = selected.includes(payment.id);
                  return (
                    <li key={payment.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-border px-3.5 py-3 text-sm has-checked:border-primary has-checked:bg-secondary/40 has-focus-visible:ring-2 has-focus-visible:ring-ring">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => setSelected(event.target.checked ? [...selected, payment.id] : selected.filter((id) => id !== payment.id))}
                          className="size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                        />
                        <span className="min-w-0 flex-1">
                          <DateText iso={payment.effectiveDate} />
                          {payment.method && <span className="text-muted-foreground"> · {t(`labels.method.${payment.method as "CASH"}`)}</span>}
                        </span>
                        <Money minor={payment.amountMinor} currency={currency} className="font-medium" />
                      </label>
                    </li>
                  );
                })}
              </ul>
              {notShared > 0 && <p className="mt-2 text-xs leading-relaxed text-waiting">{t("convert.notSelectedWarning", { count: notShared })}</p>}
            </>
          )}
        </fieldset>
      )}

      <section aria-labelledby="preview-title" className="rounded-2xl border border-dashed border-input bg-muted/50 p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="preview-title" className="text-sm font-semibold">
            {t("convert.preview", { name: counterpartyName })}
          </h2>
          <WeightBadge weight="proposal" />
        </div>
        <dl className="tabular flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t("convert.previewAmount")}</dt>
            <dd>
              <Money minor={proposedAmount} currency={currency} />
            </dd>
          </div>
          {full && recognised > 0n && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t("convert.previewRecognised")}</dt>
              <dd>
                <Money minor={recognised} currency={currency} sign="−" />
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-border pt-1.5 font-semibold">
            <dt>{t("convert.previewOpening")}</dt>
            <dd>
              <Money minor={opening > 0n ? opening : 0n} currency={currency} />
            </dd>
          </div>
        </dl>
        {invalid && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t("validation.previousPaymentsTooMuch")}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {hasNotes && (
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]" />
            <span>
              {t("convert.includeNotes")}
              <span className="block text-xs text-muted-foreground">{t("convert.includeNotesHint")}</span>
            </span>
          </label>
        )}
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={includeReceipts && receiptCount > 0}
            disabled={receiptCount === 0}
            onChange={(event) => setIncludeReceipts(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
          />
          <span>
            {t("convert.includeReceipts")}
            <span className="block text-xs text-muted-foreground">{t("convert.includeReceiptsHint", { count: receiptCount })}</span>
          </span>
        </label>
      </div>

      <FormField label={t("convert.email", { name: counterpartyName })} hint={t("wizard.review.inviteEmailHint")} error={emailError} optional optionalLabel={t("common.optional")}>
        {(field) => (
          <Input
            {...field}
            type="email"
            inputMode="email"
            autoComplete="off"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(undefined);
            }}
          />
        )}
      </FormField>

      {canShareAccount && accounts.length > 0 && (
        <FormField label={t("wizard.plan.shareAccount")} hint={t("wizard.plan.shareAccountHint")} optional optionalLabel={t("common.optional")}>
          {(field) => (
            <NativeSelect {...field} value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{t("wizard.plan.noAccount")}</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.alias} · {account.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      )}

      <p className="rounded-2xl bg-secondary px-4 py-3 text-xs leading-relaxed text-secondary-foreground">{t("wizard.review.acceptNotice")}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button asChild variant="ghost">
          <Link href={`/app/debts/${debtId}`}>{t("common.cancel")}</Link>
        </Button>
        <Button type="submit" disabled={pending || invalid} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("convert.submit")}
        </Button>
      </div>
    </form>
  );
}
