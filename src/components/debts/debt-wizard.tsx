"use client";

import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, FileText, Loader2, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { createDebtAction, type CreatedDebt } from "@/actions/debts";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { PreviousPaymentsEditor, type PreviousPaymentDraft } from "@/components/debts/previous-payments-editor";
import { EMPTY_SCHEDULE, resolveInstallments, ScheduleEditor, type ScheduleDraft } from "@/components/debts/schedule-editor";
import { ShareLinkPanel } from "@/components/debts/share-link";
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
import { compareISO, formatISODate, isISODate } from "@/domain/dates";
import { usesBankAccount, PAYMENT_METHODS, type PaymentMethod } from "@/domain/payment-methods";
import { intlLocales, type Locale } from "@/i18n/config";
import { RECEIPT_ACCEPT } from "@/lib/attachments";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";
import { readAmount, type ValidationKey } from "@/schemas/common";
import type { CreateDebtFormValues } from "@/schemas/debt";

export interface WizardContact {
  id: string;
  name: string;
  email: string | null;
  linked: boolean;
}

export interface WizardAccount {
  id: string;
  alias: string;
  label: string;
}

type Mode = "PERSONAL" | "SHARED";
type Role = "DEBTOR" | "CREDITOR";

interface Values {
  mode: Mode | "";
  myRole: Role | "";
  contactId: string; // "" = not chosen, "new" = a new person
  personName: string;
  personEmail: string;
  personPhone: string;
  amount: string;
  currency: string;
  concept: string;
  originDate: string;
  schedule: ScheduleDraft;
  plannedMethod: string;
  accountId: string;
  shareAccount: boolean;
  previousPayments: PreviousPaymentDraft[];
  notes: string;
  inviteEmail: string;
}

type Errors = Partial<Record<string, string>>;

const STEPS = ["mode", "who", "plan", "review"] as const;

/** Server field path → the step where that field lives. */
function stepOfField(field: string): number {
  if (field.startsWith("schedule") || field === "plannedMethod") return 2;
  if (field.startsWith("previousPayments") || field === "inviteEmail" || field === "privateNotes" || field === "sharedNotes") return 3;
  if (field === "mode") return 0;
  return 1;
}

export function DebtWizard({
  contacts,
  accounts,
  defaultCurrency,
  today,
  maxUploadMb,
  initialContactId,
  initialMode,
}: {
  contacts: WizardContact[];
  accounts: WizardAccount[];
  defaultCurrency: string;
  today: string;
  maxUploadMb: number;
  initialContactId?: string;
  initialMode?: Mode;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const router = useRouter();
  const { run, pending, fieldMessage } = useAction();

  const [step, setStep] = useState(initialMode ? 1 : 0);
  const [values, setValues] = useState<Values>({
    mode: initialMode ?? "",
    myRole: "",
    contactId: initialContactId && contacts.some((contact) => contact.id === initialContactId) ? initialContactId : contacts.length === 0 ? "new" : "",
    personName: "",
    personEmail: "",
    personPhone: "",
    amount: "",
    currency: defaultCurrency,
    concept: "",
    originDate: today,
    schedule: EMPTY_SCHEDULE,
    plannedMethod: "",
    accountId: "",
    shareAccount: false,
    previousPayments: [],
    notes: "",
    inviteEmail: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState<(CreatedDebt & { name: string }) | null>(null);
  // One key per form: a repeated submission (double click, retry) creates a single debt.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key as string] ? { ...current, [key as string]: undefined } : current));
  };

  const parsedAmount = values.amount.trim() === "" ? null : readAmount(values.amount, values.currency);
  const totalMinor = parsedAmount && !("error" in parsedAmount) ? parsedAmount.minor : null;
  const isShared = values.mode === "SHARED";
  const selectedContact = contacts.find((contact) => contact.id === values.contactId) ?? null;
  const counterpartyName = selectedContact?.name ?? values.personName.trim();
  const installments = resolveInstallments(values.schedule, totalMinor, values.currency);
  const canUseAccount = values.myRole === "CREDITOR" && usesBankAccount((values.plannedMethod || null) as PaymentMethod | null);

  let previousTotal = 0n;
  for (const payment of values.previousPayments) {
    const amount = readAmount(payment.amount, values.currency);
    if (!("error" in amount)) previousTotal += amount.minor;
  }

  const message = (key: ValidationKey) => t(`validation.${key}`);

  function validate(target: number): Errors {
    const found: Errors = {};
    if (target === 0 && !values.mode) found.mode = message("required");

    if (target === 1) {
      if (!values.myRole) found.myRole = message("required");
      if (!values.contactId) found.contactId = message("required");
      if (values.contactId === "new" && !values.personName.trim()) found.personName = message("required");
      if (values.personEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.personEmail.trim())) found.personEmail = message("email");
      if (!parsedAmount) found.amount = message("amountEmpty");
      else if ("error" in parsedAmount) found.amount = message(parsedAmount.error);
      if (!values.concept.trim()) found.concept = message("required");
      if (!isISODate(values.originDate)) found.originDate = message("date");
      else if (compareISO(values.originDate, today) > 0) found.originDate = message("dateInFuture");
    }

    if (target === 2) {
      const { type } = values.schedule;
      if (type !== "NONE") {
        if (installments.length === 0) found.schedule = message("scheduleEmpty");
        else {
          let sum = 0n;
          let previous = "";
          for (const installment of installments) {
            const amount = readAmount(installment.amount, values.currency);
            if (!isISODate(installment.dueDate)) found.schedule = message("date");
            else if (compareISO(installment.dueDate, values.originDate) < 0) found.schedule = message("dateBeforeOrigin");
            else if (previous && compareISO(installment.dueDate, previous) < 0) found.schedule = message("scheduleOrder");
            if ("error" in amount) found.schedule = message(amount.error);
            else sum += amount.minor;
            previous = installment.dueDate;
          }
          if (!found.schedule && totalMinor !== null && sum !== totalMinor) found.schedule = message("scheduleSum");
        }
      }
    }

    if (target === 3) {
      for (const payment of values.previousPayments) {
        const amount = readAmount(payment.amount, values.currency);
        if ("error" in amount) found.previousPayments = message(amount.error);
        else if (!isISODate(payment.effectiveDate)) found.previousPayments = message("date");
        else if (compareISO(payment.effectiveDate, values.originDate) < 0) found.previousPayments = message("dateBeforeOrigin");
        else if (compareISO(payment.effectiveDate, today) > 0) found.previousPayments = message("dateInFuture");
      }
      if (!found.previousPayments && totalMinor !== null && values.previousPayments.length > 0 && previousTotal >= totalMinor) {
        found.previousPayments = message("previousPaymentsTooMuch");
      }
      if (values.inviteEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.inviteEmail.trim())) found.inviteEmail = message("email");
    }
    return found;
  }

  const goTo = (target: number) => {
    setStep(target);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const next = () => {
    const found = validate(step);
    setErrors(found);
    if (Object.keys(found).length === 0) goTo(Math.min(step + 1, STEPS.length - 1));
  };

  async function uploadReceipts(debtId: string): Promise<number> {
    let failed = 0;
    for (const file of files) {
      const body = new FormData();
      body.set("debtId", debtId);
      body.set("file", file);
      try {
        const response = await fetch(withBasePath("/api/attachments"), { method: "POST", body });
        if (!response.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    return failed;
  }

  function submit(send: boolean) {
    for (const target of [1, 2, 3]) {
      const found = validate(target);
      if (Object.keys(found).length > 0) {
        setErrors(found);
        goTo(target);
        return;
      }
    }
    if (!values.mode || !values.myRole) return;

    const base = {
      idempotencyKey,
      myRole: values.myRole,
      counterparty:
        values.contactId === "new"
          ? { kind: "new" as const, name: values.personName, email: values.personEmail || null, phone: values.personPhone || null }
          : { kind: "existing" as const, id: values.contactId },
      concept: values.concept,
      currency: values.currency,
      amount: values.amount,
      originDate: values.originDate,
      schedule: { type: values.schedule.type, installments },
      plannedMethod: values.plannedMethod || null,
      previousPayments: values.previousPayments.map((payment) => ({
        amount: payment.amount,
        effectiveDate: payment.effectiveDate,
        method: payment.method || null,
        note: payment.note || null,
      })),
    };
    const input: CreateDebtFormValues =
      values.mode === "PERSONAL"
        ? { ...base, mode: "PERSONAL", privateNotes: values.notes || null, receivingAccountId: canUseAccount ? values.accountId || null : null }
        : {
            ...base,
            mode: "SHARED",
            sharedNotes: values.notes || null,
            inviteEmail: selectedContact?.linked ? null : values.inviteEmail || null,
            shareAccountId: canUseAccount && values.shareAccount ? values.accountId || null : null,
            send,
          };

    run(() => createDebtAction(input), {
      onSuccess: async (created) => {
        if (files.length > 0) {
          setUploading(true);
          const failed = await uploadReceipts(created.debtId);
          setUploading(false);
          if (failed > 0) toast.warning(t("wizard.submit.receiptsFailed", { count: failed }));
        }
        if (values.mode === "SHARED" && send) {
          setDone({ ...created, name: counterpartyName });
          return;
        }
        toast.success(values.mode === "PERSONAL" ? t("wizard.submit.createdPersonal") : t("wizard.submit.draftSaved"));
        router.push(`/app/debts/${created.debtId}`);
      },
      onError: (failure) => {
        if (!failure.fields) return false;
        const mapped: Errors = {};
        let firstStep = 3;
        for (const [field, key] of Object.entries(failure.fields)) {
          const target = field.startsWith("schedule") ? "schedule" : field.startsWith("previousPayments") ? "previousPayments" : field.startsWith("counterparty") ? "personName" : field;
          mapped[target] ??= fieldMessage(key);
          firstStep = Math.min(firstStep, stepOfField(field));
        }
        setErrors(mapped);
        goTo(firstStep);
        return false;
      },
    });
  }

  const busy = pending || uploading;

  // ── After a shared proposal was created: the share link ─────────────────────
  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-full bg-agreed-soft text-agreed" aria-hidden>
          <Check className="size-5" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold">{t("wizard.done.title")}</h1>
        {done.inviteToken ? (
          <>
            <p className="mt-2 mb-5 text-sm leading-relaxed text-muted-foreground">{t("wizard.done.text", { name: done.name })}</p>
            <ShareLinkPanel token={done.inviteToken} emailedTo={done.emailedTo} />
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("wizard.done.sentDirect", { name: done.name })}</p>
        )}
        <Button asChild className="mt-6" variant={done.inviteToken ? "outline" : "default"}>
          <Link href={`/app/debts/${done.debtId}`}>
            {t("wizard.done.goToDebt")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progress */}
      <ol className="mb-6 flex items-center gap-2" aria-label={t("wizard.stepOf", { step: step + 1, total: STEPS.length })}>
        {STEPS.map((name, index) => (
          <li key={name} className="flex flex-1 flex-col gap-1.5" aria-current={index === step ? "step" : undefined}>
            <span className={cn("h-1 rounded-full", index <= step ? "bg-primary" : "bg-muted")} aria-hidden />
            <span className={cn("hidden text-xs sm:block", index === step ? "font-medium text-foreground" : "text-muted-foreground")}>{t(`wizard.steps.${name}`)}</span>
          </li>
        ))}
      </ol>
      <p className="mb-1 text-xs font-medium text-muted-foreground sm:hidden">{t("wizard.stepOf", { step: step + 1, total: STEPS.length })}</p>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step < STEPS.length - 1) next();
          else submit(true);
        }}
        className="rounded-2xl border border-border bg-card p-5 sm:p-7"
      >
        {/* ── Step 1: mode ─────────────────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
              {t("wizard.mode.question")}
            </h1>
            <p className="mt-1.5 mb-5 text-sm text-muted-foreground">{t("wizard.mode.help")}</p>
            <ChoiceCards
              name="mode"
              legend={t("wizard.mode.question")}
              hideLegend
              value={values.mode}
              onChange={(mode) => set("mode", mode)}
              choices={(["PERSONAL", "SHARED"] as const).map((mode) => {
                const key = mode === "PERSONAL" ? "personal" : "shared";
                return {
                  value: mode,
                  icon: <SymmetryMark state={mode === "PERSONAL" ? "one" : "both"} className="size-7" />,
                  title: t(`wizard.mode.${key}.title`),
                  description: t(`wizard.mode.${key}.subtitle`),
                  extra: (
                    <ul className="flex flex-col gap-1.5 text-sm leading-snug text-muted-foreground">
                      {(["a", "b", "c"] as const).map((point) => (
                        <li key={point} className="flex gap-2">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                          {t(`wizard.mode.${key}.points.${point}`)}
                        </li>
                      ))}
                    </ul>
                  ),
                };
              })}
            />
            {errors.mode && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {errors.mode}
              </p>
            )}
          </div>
        )}

        {/* ── Step 2: who and how much ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col gap-5">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
              {t("wizard.steps.who")}
            </h1>
            <div>
              <ChoiceCards
                name="myRole"
                legend={t("wizard.who.direction")}
                value={values.myRole}
                onChange={(role) => set("myRole", role)}
                compact
                choices={[
                  { value: "DEBTOR", title: t("wizard.who.iOwe"), description: t("wizard.who.iOweHint"), icon: <ArrowUpRight className="size-5 text-owe" aria-hidden /> },
                  { value: "CREDITOR", title: t("wizard.who.owedToMe"), description: t("wizard.who.owedToMeHint"), icon: <ArrowDownLeft className="size-5 text-owed" aria-hidden /> },
                ]}
              />
              {errors.myRole && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {errors.myRole}
                </p>
              )}
            </div>

            {contacts.length > 0 && (
              <FormField
                label={values.myRole === "DEBTOR" ? t("wizard.who.personOwe") : values.myRole === "CREDITOR" ? t("wizard.who.personOwed") : t("wizard.who.person")}
                error={errors.contactId}
              >
                {(field) => (
                  <NativeSelect {...field} value={values.contactId} onChange={(event) => set("contactId", event.target.value)}>
                    <option value="">{t("wizard.who.choosePerson")}</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                      </option>
                    ))}
                    <option value="new">{t("wizard.who.newPerson")}</option>
                  </NativeSelect>
                )}
              </FormField>
            )}

            {values.contactId === "new" && (
              <div className="flex flex-col gap-4">
                <FormField
                  label={contacts.length > 0 ? t("wizard.who.personName") : values.myRole === "DEBTOR" ? t("wizard.who.personOwe") : values.myRole === "CREDITOR" ? t("wizard.who.personOwed") : t("wizard.who.person")}
                  error={errors.personName}
                  hint={isShared ? t("wizard.who.personHintShared") : t("wizard.who.personHintPersonal")}
                >
                  {(field) => (
                    <Input {...field} maxLength={80} autoComplete="off" placeholder={t("wizard.who.personNamePlaceholder")} value={values.personName} onChange={(event) => set("personName", event.target.value)} />
                  )}
                </FormField>
                <details className="group rounded-lg border border-dashed border-border px-3 py-2 text-sm open:pb-3">
                  <summary className="cursor-pointer rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{t("wizard.who.addContact")}</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <FormField label={t("wizard.who.personEmail")} error={errors.personEmail}>
                      {(field) => <Input {...field} type="email" inputMode="email" autoComplete="off" value={values.personEmail} onChange={(event) => set("personEmail", event.target.value)} />}
                    </FormField>
                    <FormField label={t("wizard.who.personPhone")}>
                      {(field) => <Input {...field} type="tel" inputMode="tel" autoComplete="off" maxLength={40} value={values.personPhone} onChange={(event) => set("personPhone", event.target.value)} />}
                    </FormField>
                  </div>
                </details>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
              <FormField label={t("wizard.who.amount")} error={errors.amount}>
                {(field) => <AmountInput {...field} currency={values.currency} value={values.amount} onChange={(amount) => set("amount", amount)} placeholder="0.00" showPreview={!errors.amount} />}
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
            <FormField label={t("wizard.who.concept")} error={errors.concept}>
              {(field) => <Input {...field} maxLength={140} placeholder={t("wizard.who.conceptPlaceholder")} value={values.concept} onChange={(event) => set("concept", event.target.value)} />}
            </FormField>
            <FormField label={t("wizard.who.originDate")} error={errors.originDate} hint={t("wizard.who.originDateHint")} className="sm:max-w-56">
              {(field) => <Input {...field} type="date" max={today} value={values.originDate} onChange={(event) => set("originDate", event.target.value)} />}
            </FormField>
          </div>
        )}

        {/* ── Step 3: payment plan ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
              {t("wizard.steps.plan")}
            </h1>
            <ScheduleEditor
              value={values.schedule}
              onChange={(schedule) => set("schedule", schedule)}
              currency={values.currency}
              totalMinor={totalMinor}
              minDate={values.originDate}
              error={errors.schedule}
            />
            <FormField label={t("wizard.plan.method")} hint={t("wizard.plan.methodHint")} optional optionalLabel={t("common.optional")} className="sm:max-w-sm">
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

            {canUseAccount &&
              (accounts.length === 0 ? (
                <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">{t("wizard.plan.addAccountFirst")}</p>
              ) : isShared ? (
                <div className="rounded-xl border border-border p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={values.shareAccount}
                      onChange={(event) => set("shareAccount", event.target.checked)}
                      className="mt-1 size-4 shrink-0 rounded border-input accent-[var(--primary)]"
                    />
                    <span>
                      <span className="block text-sm font-medium">{t("wizard.plan.shareAccount")}</span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t("wizard.plan.shareAccountHint")}</span>
                    </span>
                  </label>
                  {values.shareAccount && (
                    <NativeSelect className="mt-3" aria-label={t("wizard.plan.chooseAccount")} value={values.accountId} onChange={(event) => set("accountId", event.target.value)}>
                      <option value="">{t("wizard.plan.chooseAccount")}</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.alias} · {account.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              ) : (
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
              ))}
          </div>
        )}

        {/* ── Step 4: details and review ───────────────────────────────────── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <h1 ref={headingRef} tabIndex={-1} className="font-display text-2xl font-semibold outline-none">
              {t("wizard.steps.review")}
            </h1>

            <section aria-labelledby="summary-title" className="rounded-xl border border-border bg-muted/40 p-4">
              <h2 id="summary-title" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <SymmetryMark state={isShared ? "none" : "one"} className={isShared ? "text-muted-foreground" : "text-personal"} />
                {isShared ? t("wizard.review.summaryShared") : t("wizard.review.summaryPersonal")}
              </h2>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{values.myRole === "DEBTOR" ? t("wizard.who.personOwe") : t("wizard.who.personOwed")}</dt>
                  <dd className="font-medium break-words">{counterpartyName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("wizard.who.amount")}</dt>
                  <dd className="font-medium">{totalMinor !== null && <Money minor={totalMinor} currency={values.currency} />}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("wizard.who.concept")}</dt>
                  <dd className="font-medium break-words">{values.concept}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("wizard.steps.plan")}</dt>
                  <dd className="font-medium">
                    {t(`labels.schedule.${values.schedule.type}`)}
                    {installments.length > 0 && isISODate(installments[installments.length - 1].dueDate) && (
                      <span className="font-normal text-muted-foreground"> · {formatISODate(installments[installments.length - 1].dueDate, intlLocale)}</span>
                    )}
                  </dd>
                </div>
                {values.previousPayments.length > 0 && totalMinor !== null && previousTotal < totalMinor && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("wizard.review.outstandingAfter")}</dt>
                    <dd className="font-medium">
                      <Money minor={totalMinor - previousTotal} currency={values.currency} />
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            <section aria-labelledby="previous-title">
              <h2 id="previous-title" className="text-sm font-semibold">
                {t("wizard.review.previousTitle")} <span className="font-normal text-muted-foreground">· {t("common.optional")}</span>
              </h2>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">{isShared ? t("wizard.review.previousHintShared") : t("wizard.review.previousHintPersonal")}</p>
              <PreviousPaymentsEditor
                value={values.previousPayments}
                onChange={(previousPayments) => set("previousPayments", previousPayments)}
                currency={values.currency}
                minDate={values.originDate}
                maxDate={today}
                error={errors.previousPayments}
              />
            </section>

            <FormField
              label={isShared ? t("wizard.review.notesShared") : t("wizard.review.notesPersonal")}
              hint={isShared ? t("wizard.review.notesSharedHint") : t("wizard.review.notesPersonalHint")}
              optional
              optionalLabel={t("common.optional")}
            >
              {(field) => <Textarea {...field} rows={3} maxLength={2000} value={values.notes} onChange={(event) => set("notes", event.target.value)} />}
            </FormField>

            <section aria-labelledby="receipts-title">
              <h2 id="receipts-title" className="text-sm font-semibold">
                {t("wizard.review.receipts")} <span className="font-normal text-muted-foreground">· {t("common.optional")}</span>
              </h2>
              <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">{t("wizard.review.receiptsHint", { max: maxUploadMb })}</p>
              {files.length > 0 && (
                <ul className="mb-3 flex flex-col gap-1.5">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        aria-label={t("wizard.review.removeReceipt", { name: file.name })}
                        onClick={() => setFiles(files.filter((_, position) => position !== index))}
                        className="rounded p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={RECEIPT_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const picked = Array.from(event.target.files ?? []);
                  const tooBig = picked.filter((file) => file.size > maxUploadMb * 1024 * 1024);
                  if (tooBig.length > 0) toast.error(t("errors.file_too_large", { max: maxUploadMb }));
                  setFiles([...files, ...picked.filter((file) => file.size <= maxUploadMb * 1024 * 1024)].slice(0, 10));
                  event.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Paperclip aria-hidden />
                {t("wizard.review.addReceipts")}
              </Button>
            </section>

            {isShared && !selectedContact?.linked && (
              <FormField label={t("wizard.review.inviteEmail")} hint={t("wizard.review.inviteEmailHint")} error={errors.inviteEmail} optional optionalLabel={t("common.optional")}>
                {(field) => (
                  <Input
                    {...field}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder={selectedContact?.email ?? ""}
                    value={values.inviteEmail}
                    onChange={(event) => set("inviteEmail", event.target.value)}
                  />
                )}
              </FormField>
            )}

            {isShared && <p className="rounded-lg bg-secondary/60 px-3 py-2.5 text-xs leading-relaxed text-secondary-foreground">{t("wizard.review.acceptNotice")}</p>}
          </div>
        )}

        {/* ── Navigation ───────────────────────────────────────────────────── */}
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          {step > 0 ? (
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)} disabled={busy}>
              <ArrowLeft aria-hidden />
              {t("common.back")}
            </Button>
          ) : (
            <Button asChild variant="ghost">
              <Link href="/app/debts">{t("common.cancel")}</Link>
            </Button>
          )}

          {step < STEPS.length - 1 ? (
            <Button type="submit">
              {t("common.continue")}
              <ArrowRight aria-hidden />
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {isShared && (
                <Button type="button" variant="outline" disabled={busy} onClick={() => submit(false)}>
                  {t("wizard.submit.draft")}
                </Button>
              )}
              <Button type="submit" disabled={busy} aria-busy={busy}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                {uploading ? t("wizard.submit.uploading") : isShared ? t("wizard.submit.shared") : t("wizard.submit.personal")}
              </Button>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
