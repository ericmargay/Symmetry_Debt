"use client";

import { CalendarCheck2, ChevronDown, Loader2, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { recordMovementAction, updateMovementAction } from "@/actions/movements";
import { uploadReceipts } from "@/components/debts/detail/attachments";
import { AmountInput } from "@/components/shared/amount-input";
import { ChoiceCards } from "@/components/shared/choice-cards";
import { FormField } from "@/components/shared/form-field";
import { DateText } from "@/components/shared/dates";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DebtMode } from "@/domain/balance";
import { compareISO, isISODate } from "@/domain/dates";
import { formatMoney, toInputValue } from "@/domain/money";
import { PAYMENT_METHODS } from "@/domain/payment-methods";
import { intlLocales, type Locale } from "@/i18n/config";
import { RECEIPT_ACCEPT } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { readAmount } from "@/schemas/common";
import { Money } from "@/components/shared/money";

function readAmountMinor(value: string, currency: string): bigint {
  const amount = readAmount(value, currency);
  return "error" in amount ? 0n : amount.minor;
}

export type MovementFormKind = "PAYMENT" | "ADJUSTMENT" | "REVERSAL";

export interface DestinationOption {
  id: string;
  label: string;
}

export interface MovementFormContext {
  debtId: string;
  mode: DebtMode;
  currency: string;
  counterpartyName: string;
  today: string;
  originDate: string;
  /** Most that can still be paid (already net of what is waiting to be confirmed). */
  roomMinor: bigint;
  /** Saved accounts the money can be said to have gone to. */
  destinations: DestinationOption[];
  maxUploadMb: number;
}

/** Marking an instalment of the schedule as paid, from the checklist. */
export interface InstallmentToMark {
  sequence: number;
  dueDate: string;
  /** What paying it in full costs: its open amount plus any earlier instalment still open. */
  fullMinor: bigint;
  /** How many earlier instalments are still open and therefore included in `fullMinor`. */
  earlierOpen: number;
  /** The oldest instalment still open: where any payment lands first. */
  firstOpenSequence: number;
}

/** "Hola Ivonne, te marqué …": a message to tell the other side on WhatsApp, with the link. */
export function whatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export interface MovementToEdit {
  id: string;
  kind: "PAYMENT" | "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE" | "REVERSAL";
  amountMinor: bigint;
  effectiveDate: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  place: string | null;
  originBank: string | null;
  destinationAccountId: string | null;
  destinationLabel: string | null;
  trackingKey: string | null;
}

interface Values {
  amount: string;
  effectiveDate: string;
  method: string;
  reference: string;
  notes: string;
  place: string;
  originBank: string;
  destination: string; // account id, "other" or ""
  destinationText: string;
  trackingKey: string;
  adjustment: "ADJUSTMENT_INCREASE" | "ADJUSTMENT_DECREASE";
}

/**
 * Records a payment, an adjustment or the reversal of a payment — or edits one of the owner's
 * own personal records. What it says before saving depends on the mode: a personal record
 * changes the balance at once; in a shared agreement it waits for the other side.
 */
export function MovementDialog({
  open,
  onOpenChange,
  context,
  kind,
  edit,
  reversal,
  installment,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: MovementFormContext;
  kind: MovementFormKind;
  edit?: MovementToEdit | null;
  reversal?: { id: string; amountMinor: bigint } | null;
  installment?: InstallmentToMark | null;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const router = useRouter();
  const { run, pending, fieldMessage } = useAction();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // Marking an instalment: paid in full (the amount is known) or in part (type how much).
  const [coverage, setCoverage] = useState<"FULL" | "PARTIAL">("FULL");
  const [showDetails, setShowDetails] = useState(false);

  const isEdit = Boolean(edit);
  const isShared = context.mode === "SHARED";
  const effectiveKind: MovementFormKind = edit ? (edit.kind === "PAYMENT" ? "PAYMENT" : edit.kind === "REVERSAL" ? "REVERSAL" : "ADJUSTMENT") : kind;

  const form = useForm<Values>({
    values: {
      amount: edit ? toInputValue(edit.amountMinor, context.currency) : "",
      effectiveDate: edit?.effectiveDate ?? context.today,
      method: edit?.method ?? "",
      reference: edit?.reference ?? "",
      notes: edit?.notes ?? "",
      place: edit?.place ?? "",
      originBank: edit?.originBank ?? "",
      destination: edit?.destinationAccountId ?? (edit?.destinationLabel ? "other" : ""),
      destinationText: edit && !edit.destinationAccountId ? (edit.destinationLabel ?? "") : "",
      trackingKey: edit?.trackingKey ?? "",
      adjustment: edit?.kind === "ADJUSTMENT_DECREASE" ? "ADJUSTMENT_DECREASE" : "ADJUSTMENT_INCREASE",
    },
  });
  const { register, control, handleSubmit, setError, setValue, formState } = form;
  const method = useWatch({ control, name: "method" });
  const destination = useWatch({ control, name: "destination" });
  const adjustment = useWatch({ control, name: "adjustment" });
  const errors = formState.errors;

  const usesBank = method === "BANK_TRANSFER" || method === "BANK_DEPOSIT";
  // Editing: the movement's own amount is available again.
  const room = context.roomMinor + (edit && (edit.kind === "PAYMENT" || edit.kind === "ADJUSTMENT_DECREASE") ? edit.amountMinor : 0n);
  const limited = effectiveKind === "PAYMENT" || (effectiveKind === "ADJUSTMENT" && adjustment === "ADJUSTMENT_DECREASE");

  const marking = Boolean(installment) && !isEdit && effectiveKind === "PAYMENT";
  const full = marking && coverage === "FULL";

  const title = marking
    ? t("detail.form.installmentTitle", { number: installment?.sequence ?? 0 })
    : isEdit ? t("detail.form.editTitle") : effectiveKind === "PAYMENT" ? t("detail.form.paymentTitle") : effectiveKind === "ADJUSTMENT" ? t("detail.form.adjustmentTitle") : t("detail.form.reversalTitle");

  const close = () => {
    onOpenChange(false);
    setFiles([]);
    form.reset();
    setCoverage("FULL");
    setIdempotencyKey(crypto.randomUUID());
  };

  const onSubmit = handleSubmit((raw) => {
    const values = full && installment ? { ...raw, amount: toInputValue(installment.fullMinor, context.currency) } : raw;
    let hasError = false;
    const fail = (field: keyof Values, key: Parameters<typeof fieldMessage>[0]) => {
      setError(field, { message: fieldMessage(key) });
      hasError = true;
    };

    if (effectiveKind !== "REVERSAL") {
      const amount = readAmount(values.amount, context.currency);
      if ("error" in amount) fail("amount", amount.error);
      else if (limited && amount.minor > room) fail("amount", "amountExceedsBalance");
    }
    if (!isISODate(values.effectiveDate)) fail("effectiveDate", "date");
    else if (compareISO(values.effectiveDate, context.today) > 0) fail("effectiveDate", "dateInFuture");
    else if (compareISO(values.effectiveDate, context.originDate) < 0) fail("effectiveDate", "dateBeforeOrigin");
    if (effectiveKind !== "PAYMENT" && !values.notes.trim()) fail("notes", "required");
    if (hasError) return;

    const isPayment = effectiveKind === "PAYMENT";
    const shared = {
      amount: values.amount,
      effectiveDate: values.effectiveDate,
      method: isPayment ? values.method || null : null,
      reference: isPayment ? values.reference || null : null,
      notes: values.notes || null,
      place: isPayment && values.method === "CASH" ? values.place || null : null,
      originBank: isPayment && values.method === "BANK_TRANSFER" ? values.originBank || null : null,
      destinationAccountId: isPayment && usesBank && values.destination && values.destination !== "other" ? values.destination : null,
      destinationText: isPayment && usesBank && values.destination === "other" ? values.destinationText || null : null,
      trackingKey: isPayment && values.method === "BANK_TRANSFER" ? values.trackingKey || null : null,
    };

    const onError = (failure: { fields?: Record<string, string> }) => {
      if (!failure.fields) return false;
      for (const [field, key] of Object.entries(failure.fields)) {
        if (field in values) setError(field as keyof Values, { message: fieldMessage(key) });
      }
      return false;
    };

    if (edit) {
      run(() => updateMovementAction(edit.id, shared), { successMessage: t("detail.form.saved"), onSuccess: close, onError });
      return;
    }

    const kindToSend = effectiveKind === "ADJUSTMENT" ? values.adjustment : effectiveKind;
    run(() => recordMovementAction(context.debtId, { ...shared, idempotencyKey, kind: kindToSend, reversesId: reversal?.id ?? null }), {
      onError,
      onSuccess: async ({ paymentId }) => {
        if (files.length > 0) {
          setUploading(true);
          const failed = await uploadReceipts(files, context.debtId, paymentId);
          setUploading(false);
          if (failed > 0) toast.warning(t("wizard.submit.receiptsFailed", { count: failed }));
          router.refresh();
        }
        if (isShared && kindToSend === "PAYMENT") {
          // Nobody gets an email on this instance by default: offer to tell them on WhatsApp.
          const amountText = formatMoney(readAmountMinor(values.amount, context.currency), context.currency, intlLocale);
          const url = window.location.href.split(/[?#]/)[0];
          const text = installment
            ? t("detail.form.whatsappInstallment", { name: context.counterpartyName, amount: amountText, number: installment.sequence, url })
            : t("detail.form.whatsappPayment", { name: context.counterpartyName, amount: amountText, url });
          toast.success(t("detail.form.sent", { name: context.counterpartyName }), {
            duration: 12000,
            action: { label: t("detail.form.whatsapp"), onClick: () => window.open(whatsAppUrl(text), "_blank", "noopener,noreferrer") },
          });
        } else {
          toast.success(isShared ? t("detail.form.sent", { name: context.counterpartyName }) : t("detail.form.saved"));
        }
        close();
      },
    });
  });

  const busy = pending || uploading;

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : next ? onOpenChange(true) : close())}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {effectiveKind === "REVERSAL" && reversal
                ? t("detail.form.reversalNote", { amount: formatMoney(reversal.amountMinor, context.currency, intlLocale) })
                : isShared
                  ? t("detail.form.sharedNote", { name: context.counterpartyName })
                  : t("detail.form.personalNote")}
            </DialogDescription>
          </DialogHeader>

          {effectiveKind === "ADJUSTMENT" && !isEdit && (
            <Controller
              control={control}
              name="adjustment"
              render={({ field }) => (
                <ChoiceCards
                  name="adjustment"
                  legend={t("detail.form.kind")}
                  value={field.value}
                  onChange={field.onChange}
                  compact
                  choices={[
                    { value: "ADJUSTMENT_INCREASE", title: t("detail.form.increase"), description: t("detail.form.increaseHint") },
                    { value: "ADJUSTMENT_DECREASE", title: t("detail.form.decrease"), description: t("detail.form.decreaseHint") },
                  ]}
                />
              )}
            />
          )}

          {marking && installment && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 rounded-2xl bg-secondary/60 px-4 py-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-[var(--shadow-card)]">
                  <CalendarCheck2 className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{t("detail.installments.number", { number: installment.sequence })}</p>
                  <p className="text-muted-foreground">
                    {t("detail.installments.due")} <DateText iso={installment.dueDate} />
                  </p>
                </div>
              </div>
              <div role="radiogroup" aria-label={t("detail.form.coverage")} className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
                {(["FULL", "PARTIAL"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={coverage === option}
                    onClick={() => setCoverage(option)}
                    className={cn(
                      "min-h-10 rounded-full px-3 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      coverage === option ? "bg-card text-foreground shadow-[var(--shadow-card)]" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option === "FULL" ? t("detail.form.full") : t("detail.form.partial")}
                  </button>
                ))}
              </div>
              {full && (
                <div className="rounded-2xl border border-border px-4 py-3">
                  <p className="text-xs font-medium text-muted-foreground">{t("detail.form.amount")}</p>
                  <p className="font-display text-3xl font-extrabold tracking-tight">
                    <Money minor={installment.fullMinor} currency={context.currency} display />
                  </p>
                  {installment.earlierOpen > 0 && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("detail.form.includesEarlier", { count: installment.earlierOpen })}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {effectiveKind !== "REVERSAL" && !full && (
            <FormField
              label={t("detail.form.amount")}
              error={errors.amount?.message}
              hint={
                marking && installment && installment.earlierOpen > 0 ? (
                  t("detail.form.appliesToOldest", { number: installment.firstOpenSequence })
                ) : limited && room > 0n ? (
                  <button
                    type="button"
                    className="rounded underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setValue("amount", toInputValue(room, context.currency), { shouldDirty: true })}
                  >
                    {effectiveKind === "PAYMENT" ? `${t("detail.form.payAll")}: ` : `${t("detail.form.maxAmount", { amount: "" })} `}
                    {formatMoney(room, context.currency, intlLocale)}
                  </button>
                ) : undefined
              }
            >
              {(field) => (
                <Controller
                  control={control}
                  name="amount"
                  render={({ field: controlled }) => (
                    <AmountInput {...field} currency={context.currency} value={controlled.value} onChange={controlled.onChange} placeholder="0.00" showPreview={!errors.amount} autoFocus />
                  )}
                />
              )}
            </FormField>
          )}

          <FormField label={t("detail.form.effectiveDate")} error={errors.effectiveDate?.message} hint={t("detail.form.effectiveDateHint")}>
            {(field) => <Input {...field} type="date" min={context.originDate} max={context.today} {...register("effectiveDate")} />}
          </FormField>

          {marking && (
            <button
              type="button"
              onClick={() => setShowDetails((value) => !value)}
              aria-expanded={showDetails}
              className="flex items-center justify-between rounded-xl px-1 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("detail.form.moreDetails")}
              <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} aria-hidden />
            </button>
          )}

          {effectiveKind === "PAYMENT" && (!marking || showDetails) && (
            <>
              <FormField label={t("detail.form.method")} optional optionalLabel={t("common.optional")}>
                {(field) => (
                  <NativeSelect {...field} {...register("method")}>
                    <option value="">{t("labels.method.none")}</option>
                    {PAYMENT_METHODS.map((option) => (
                      <option key={option} value={option}>
                        {t(`labels.method.${option}`)}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>

              {method === "CASH" && (
                <FormField label={t("detail.form.place")} optional optionalLabel={t("common.optional")}>
                  {(field) => <Input {...field} maxLength={160} {...register("place")} />}
                </FormField>
              )}

              {usesBank && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {method === "BANK_TRANSFER" && (
                    <FormField label={t("detail.form.originBank")} optional optionalLabel={t("common.optional")}>
                      {(field) => <Input {...field} maxLength={80} {...register("originBank")} />}
                    </FormField>
                  )}
                  <FormField label={t("detail.form.destination")} optional optionalLabel={t("common.optional")}>
                    {(field) => (
                      <NativeSelect {...field} {...register("destination")}>
                        <option value="">{t("common.notSet")}</option>
                        {context.destinations.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                        <option value="other">{t("detail.form.destinationOther")}</option>
                      </NativeSelect>
                    )}
                  </FormField>
                  {destination === "other" && (
                    <FormField label={t("detail.form.destinationText")} className="sm:col-span-2">
                      {(field) => <Input {...field} maxLength={120} placeholder={t("detail.form.destinationTextPlaceholder")} {...register("destinationText")} />}
                    </FormField>
                  )}
                  {method === "BANK_TRANSFER" && (
                    <FormField label={t("detail.form.trackingKey")} optional optionalLabel={t("common.optional")} className="sm:col-span-2">
                      {(field) => <Input {...field} maxLength={60} autoComplete="off" className="font-mono text-sm" {...register("trackingKey")} />}
                    </FormField>
                  )}
                </div>
              )}

              <FormField label={t("detail.form.reference")} optional optionalLabel={t("common.optional")}>
                {(field) => <Input {...field} maxLength={120} {...register("reference")} />}
              </FormField>
            </>
          )}

          {(!marking || showDetails) && (
          <FormField
            label={effectiveKind === "PAYMENT" ? t("detail.form.notes") : t("detail.form.reason")}
            error={errors.notes?.message}
            hint={effectiveKind !== "PAYMENT" && isShared ? t("detail.form.reasonHint") : undefined}
            optional={effectiveKind === "PAYMENT"}
            optionalLabel={t("common.optional")}
          >
            {(field) => <Textarea {...field} rows={2} maxLength={1000} {...register("notes")} />}
          </FormField>
          )}

          {!isEdit && (!marking || showDetails) && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {t("detail.form.receipt")} <span className="font-normal text-muted-foreground">· {t("common.optional")}</span>
              </span>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-input px-3 py-2.5 text-sm text-muted-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring">
                <Paperclip className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{files.length > 0 ? files.map((file) => file.name).join(", ") : t("detail.attachments.add")}</span>
                <input
                  type="file"
                  multiple
                  accept={RECEIPT_ACCEPT}
                  className="sr-only"
                  onChange={(event) => {
                    const picked = Array.from(event.target.files ?? []);
                    if (picked.some((file) => file.size > context.maxUploadMb * 1024 * 1024)) toast.error(t("errors.file_too_large", { max: context.maxUploadMb }));
                    setFiles(picked.filter((file) => file.size <= context.maxUploadMb * 1024 * 1024).slice(0, 5));
                  }}
                />
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("detail.form.receiptHint")}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              {uploading
                ? t("detail.attachments.uploading")
                : marking
                  ? isShared
                    ? t("detail.form.submitInstallmentShared", { name: context.counterpartyName })
                    : t("detail.form.submitInstallmentPersonal")
                  : isShared
                    ? t("detail.form.submitShared")
                    : t("detail.form.submitPersonal")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
