"use client";

import { ArrowDownLeft, ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { proposeVersionAction, updateDraftAction } from "@/actions/agreements";
import { updatePersonalDebtAction } from "@/actions/debts";
import { PreviousPaymentsEditor, type PreviousPaymentDraft } from "@/components/debts/previous-payments-editor";
import { resolveInstallments, ScheduleEditor, type ScheduleDraft } from "@/components/debts/schedule-editor";
import { AmountInput } from "@/components/shared/amount-input";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { FormField } from "@/components/shared/form-field";
import { Money } from "@/components/shared/money";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_CODES } from "@/domain/currencies";
import { PAYMENT_METHODS } from "@/domain/payment-methods";
import type { ActionResult } from "@/lib/action-result";
import { readAmount } from "@/schemas/common";

export type TermsFormVariant = "personal" | "draft" | "counter" | "amendment";

export interface TermsFormInitial {
  concept: string;
  currency: string;
  amount: string;
  originDate: string;
  schedule: ScheduleDraft;
  plannedMethod: string;
  notes: string;
  previousPayments: PreviousPaymentDraft[];
  myRole: "DEBTOR" | "CREDITOR";
  contactId: string;
  accountId: string;
}

/**
 * Edits terms. One form, four situations:
 *
 *   personal   the owner edits their own record — applied at once
 *   draft      a shared agreement that has not been sent yet
 *   counter    new terms while negotiating — replaces what is on the table
 *   amendment  changes to an agreement in force — the amount is locked, the other side must accept
 */
export function TermsForm({
  debtId,
  variant,
  initial,
  counterpartyName,
  today,
  contacts,
  accounts,
}: {
  debtId: string;
  variant: TermsFormVariant;
  initial: TermsFormInitial;
  counterpartyName: string;
  today: string;
  contacts: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; alias: string; label: string }>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending, fieldMessage } = useAction();
  const [values, setValues] = useState(initial);
  const [changeNote, setChangeNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const isPersonal = variant === "personal";
  const amountLocked = variant === "amendment";
  const withPrevious = variant === "draft" || variant === "counter";
  const parsed = readAmount(values.amount, values.currency);
  const totalMinor = "error" in parsed ? null : parsed.minor;

  const set = <K extends keyof TermsFormInitial>(key: K, value: TermsFormInitial[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, schedule: key === "amount" || key === "schedule" ? undefined : current.schedule }));
  };

  const submit = () => {
    const terms = {
      concept: values.concept,
      currency: values.currency,
      amount: values.amount,
      originDate: values.originDate,
      schedule: { type: values.schedule.type, installments: resolveInstallments(values.schedule, totalMinor, values.currency) },
      plannedMethod: values.plannedMethod || null,
    };
    const previousPayments = withPrevious
      ? values.previousPayments.map((payment) => ({ amount: payment.amount, effectiveDate: payment.effectiveDate, method: payment.method || null, note: payment.note || null }))
      : [];

    let action: () => Promise<ActionResult<unknown>>;
    let message: string;
    if (isPersonal) {
      action = () =>
        updatePersonalDebtAction(debtId, {
          ...terms,
          myRole: values.myRole,
          counterparty: { kind: "existing", id: values.contactId },
          privateNotes: values.notes || null,
          receivingAccountId: values.myRole === "CREDITOR" ? values.accountId || null : null,
        });
      message = t("termsForm.saved");
    } else {
      const input = { ...terms, previousPayments, idempotencyKey, sharedNotes: values.notes || null, changeNote: changeNote || null };
      action = variant === "draft" ? () => updateDraftAction(debtId, input) : () => proposeVersionAction(debtId, input);
      message = variant === "draft" ? t("termsForm.saved") : t("termsForm.sent", { name: counterpartyName });
    }

    run(action, {
      onSuccess: () => {
        toast.success(message);
        router.push(`/app/debts/${debtId}`);
      },
      onError: (failure) => {
        if (!failure.fields) return false;
        const mapped: Partial<Record<string, string>> = {};
        for (const [field, key] of Object.entries(failure.fields)) {
          const target = field.startsWith("schedule") ? "schedule" : field.startsWith("previousPayments") ? "previousPayments" : field;
          mapped[target] ??= fieldMessage(key);
        }
        setErrors(mapped);
        return false;
      },
    });
  };

  return (
    <form
      noValidate
      className="mx-auto flex max-w-2xl flex-col gap-6 rounded-2xl border border-border bg-card p-5 sm:p-7"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {isPersonal && (
        <>
          <ChoiceCards
            name="myRole"
            legend={t("termsForm.direction")}
            value={values.myRole}
            onChange={(role) => set("myRole", role)}
            compact
            choices={[
              { value: "DEBTOR", title: t("wizard.who.iOwe"), icon: <ArrowUpRight className="size-5 text-owe" aria-hidden /> },
              { value: "CREDITOR", title: t("wizard.who.owedToMe"), icon: <ArrowDownLeft className="size-5 text-owed" aria-hidden /> },
            ]}
          />
          <FormField label={t("wizard.who.person")} error={errors["counterparty.id"]}>
            {(field) => (
              <NativeSelect {...field} value={values.contactId} onChange={(event) => set("contactId", event.target.value)}>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </>
      )}

      <FormField label={t("wizard.who.concept")} error={errors.concept}>
        {(field) => <Input {...field} maxLength={140} value={values.concept} onChange={(event) => set("concept", event.target.value)} />}
      </FormField>

      {amountLocked ? (
        <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t("termsForm.lockedAmount")}: </span>
          {totalMinor !== null && <Money minor={totalMinor} currency={values.currency} className="font-semibold" />}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <FormField label={t("wizard.who.amount")} error={errors.amount}>
            {(field) => <AmountInput {...field} currency={values.currency} value={values.amount} onChange={(amount) => set("amount", amount)} showPreview={!errors.amount} />}
          </FormField>
          <FormField label={t("wizard.who.currency")}>
            {(field) => (
              <NativeSelect {...field} value={values.currency} onChange={(event) => set("currency", event.target.value)}>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      )}

      {!amountLocked && (
        <FormField label={t("wizard.who.originDate")} error={errors.originDate} className="sm:max-w-56">
          {(field) => <Input {...field} type="date" max={today} value={values.originDate} onChange={(event) => set("originDate", event.target.value)} />}
        </FormField>
      )}

      <ScheduleEditor value={values.schedule} onChange={(schedule) => set("schedule", schedule)} currency={values.currency} totalMinor={totalMinor} minDate={values.originDate} error={errors.schedule} />

      <FormField label={t("wizard.plan.method")} optional optionalLabel={t("common.optional")} className="sm:max-w-sm">
        {(field) => (
          <NativeSelect {...field} value={values.plannedMethod} onChange={(event) => set("plannedMethod", event.target.value)}>
            <option value="">{t("wizard.plan.noMethod")}</option>
            {PAYMENT_METHODS.map((method) => (
              <option key={method} value={method}>
                {t(`labels.method.${method}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      {isPersonal && values.myRole === "CREDITOR" && accounts.length > 0 && (
        <FormField label={t("wizard.plan.receivingAccount")} hint={t("wizard.plan.receivingAccountHint")} optional optionalLabel={t("common.optional")} className="sm:max-w-sm">
          {(field) => (
            <NativeSelect {...field} value={values.accountId} onChange={(event) => set("accountId", event.target.value)}>
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

      {withPrevious && (
        <section aria-labelledby="previous-title">
          <h2 id="previous-title" className="text-sm font-semibold">
            {t("termsForm.previousTitle")} <span className="font-normal text-muted-foreground">· {t("common.optional")}</span>
          </h2>
          <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">{t("wizard.review.previousHintShared")}</p>
          <PreviousPaymentsEditor
            value={values.previousPayments}
            onChange={(previousPayments) => set("previousPayments", previousPayments)}
            currency={values.currency}
            minDate={values.originDate}
            maxDate={today}
            error={errors.previousPayments}
          />
        </section>
      )}

      <FormField
        label={isPersonal ? t("wizard.review.notesPersonal") : t("wizard.review.notesShared")}
        hint={isPersonal ? t("wizard.review.notesPersonalHint") : t("wizard.review.notesSharedHint")}
        optional
        optionalLabel={t("common.optional")}
      >
        {(field) => <Textarea {...field} rows={3} maxLength={2000} value={values.notes} onChange={(event) => set("notes", event.target.value)} />}
      </FormField>

      {(variant === "counter" || variant === "amendment") && (
        <FormField label={t("termsForm.changeNote", { name: counterpartyName })} hint={t("termsForm.changeNoteHint")} optional optionalLabel={t("common.optional")}>
          {(field) => <Textarea {...field} rows={2} maxLength={1000} value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />}
        </FormField>
      )}

      {!isPersonal && variant !== "draft" && <p className="rounded-lg bg-secondary/60 px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">{t("wizard.review.acceptNotice")}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button asChild variant="ghost">
          <Link href={`/app/debts/${debtId}`}>{t("common.cancel")}</Link>
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {isPersonal ? t("termsForm.save") : variant === "draft" ? t("termsForm.saveDraft") : t("termsForm.send")}
        </Button>
      </div>
    </form>
  );
}
