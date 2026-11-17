import { useLocale, useTranslations } from "next-intl";
import { DateText } from "@/components/shared/dates";
import { formatISODate } from "@/domain/dates";
import { intlLocales, type Locale } from "@/i18n/config";
import { Money } from "@/components/shared/money";
import { historicalTotalMinor, type TermsSnapshot } from "@/domain/terms";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

/**
 * The terms of a debt, read-only. Used on the debt page, in proposals and on the invitation
 * page, so both sides always look at the same layout of the same facts.
 */
export function TermsSummary({ terms, showSchedule = true }: { terms: TermsSnapshot; showSchedule?: boolean }) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const principal = BigInt(terms.principalMinor);
  const historical = historicalTotalMinor(terms);

  return (
    <div>
      <dl className="divide-y divide-border">
        <Row label={terms.balanceAsOf ? t("detail.terms.balanceAsOf") : t("detail.terms.amount")}>
          <Money minor={principal} currency={terms.currency} />
          {terms.balanceAsOf && (
            <span className="block text-xs font-normal text-muted-foreground">
              {t("detail.balance.asOf", { date: formatISODate(terms.balanceAsOf, intlLocales[locale] ?? intlLocales.es) })}
            </span>
          )}
        </Row>
        <Row label={t("detail.terms.concept")}>{terms.concept}</Row>
        <Row label={t("detail.terms.originDate")}>
          <DateText iso={terms.originDate} />
        </Row>
        <Row label={t("detail.terms.plan")}>
          {t(`labels.schedule.${terms.scheduleType}`)}
          {terms.installments.length > 1 && (
            <span className="block text-xs font-normal text-muted-foreground">{t("detail.terms.installments", { count: terms.installments.length })}</span>
          )}
        </Row>
        <Row label={t("detail.terms.dueDate")}>{terms.dueDate ? <DateText iso={terms.dueDate} /> : t("detail.terms.noDueDate")}</Row>
        {terms.plannedMethod && <Row label={t("detail.terms.method")}>{t(`labels.method.${terms.plannedMethod}`)}</Row>}
      </dl>

      {showSchedule && terms.installments.length > 1 && (
        <ol className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {terms.installments.map((installment) => (
            <li key={installment.sequence} className="tabular flex justify-between gap-3 rounded-md bg-muted/50 px-2.5 py-1.5">
              <span className="text-muted-foreground">
                {installment.sequence}. <DateText iso={installment.dueDate} />
              </span>
              <Money minor={installment.amountMinor} currency={terms.currency} className="font-medium" />
            </li>
          ))}
        </ol>
      )}

      {terms.historicalPayments.length > 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-border p-3">
          <p className="text-sm font-medium">{t("detail.terms.historical")}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("detail.terms.historicalHint")}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {terms.historicalPayments.map((payment, index) => (
              <li key={index} className="tabular flex justify-between gap-3">
                <span className="min-w-0 text-muted-foreground">
                  <DateText iso={payment.effectiveDate} />
                  {payment.method && ` · ${t(`labels.method.${payment.method}`)}`}
                  {payment.note && <span className="block truncate text-xs">{payment.note}</span>}
                </span>
                <Money minor={payment.amountMinor} currency={terms.currency} sign="−" className="font-medium" />
              </li>
            ))}
          </ul>
          <p className="tabular mt-2 flex justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
            <span>{t("detail.terms.openingBalance")}</span>
            <Money minor={principal - historical} currency={terms.currency} />
          </p>
        </div>
      )}

      {terms.sharedNotes && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground">{t("detail.terms.notes")}</p>
          <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{terms.sharedNotes}</p>
        </div>
      )}
    </div>
  );
}
