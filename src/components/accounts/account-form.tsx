"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Loader2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { createBankAccountAction, revealBankAccountAction, updateBankAccountAction } from "@/actions/accounts";
import { FormField } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { validateClabe } from "@/domain/clabe";
import { CURRENCY_CODES } from "@/domain/currencies";
import { bankAccountInputSchema, type BankAccountFormValues, type BankAccountInput } from "@/schemas/bank-account";

export interface AccountToEdit {
  id: string;
  alias: string;
  bankName: string;
  holderName: string;
  currency: string;
  isPreferred: boolean;
}

/**
 * Adds or edits a bank account for RECEIVING money.
 * The CLABE is checked while typing (length and check digit) and the bank is suggested from its
 * first three digits. There is no field for passwords, PINs or card data, on purpose.
 */
export function AccountFormButton({ account, defaultCurrency, defaultHolder }: { account?: AccountToEdit; defaultCurrency: string; defaultHolder: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { run, pending, fieldMessage } = useAction();
  const form = useForm<BankAccountFormValues, unknown, BankAccountInput>({
    resolver: zodResolver(bankAccountInputSchema),
    defaultValues: {
      alias: account?.alias ?? "",
      bankName: account?.bankName ?? "",
      holderName: account?.holderName ?? defaultHolder,
      clabe: "",
      accountNumber: "",
      currency: account?.currency ?? defaultCurrency,
      isPreferred: account?.isPreferred ?? false,
    },
  });
  const { register, handleSubmit, setError, setValue, getValues, reset, control, formState } = form;
  const errors = formState.errors;
  const clabe = useWatch({ control, name: "clabe" }) ?? "";
  const check = clabe.trim() === "" ? null : validateClabe(clabe);

  const openDialog = () => {
    setOpen(true);
    if (!account) return;
    // The numbers are only fetched when the owner opens the form to edit them.
    setLoading(true);
    revealBankAccountAction(account.id)
      .then((result) => {
        if (result.ok) {
          setValue("clabe", result.data.clabe ?? "");
          setValue("accountNumber", result.data.accountNumber ?? "");
        }
      })
      .finally(() => setLoading(false));
  };

  const onSubmit = handleSubmit((values) => {
    const input: BankAccountFormValues = { ...values };
    const handlers = {
      successMessage: t("accounts.form.saved"),
      onSuccess: () => {
        setOpen(false);
        if (!account) reset();
      },
      onError: (failure: { fields?: Record<string, string> }) => {
        for (const [field, key] of Object.entries(failure.fields ?? {})) setError(field as keyof BankAccountFormValues, { message: key });
        return false;
      },
    };
    if (account) run(() => updateBankAccountAction(account.id, input), handlers);
    else run(() => createBankAccountAction(input), handlers);
  });

  return (
    <>
      <Button type="button" variant={account ? "outline" : "default"} size={account ? "sm" : "default"} onClick={openDialog}>
        {account ? <Pencil aria-hidden /> : <Plus aria-hidden />}
        {account ? t("accounts.edit") : t("accounts.add")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{account ? t("accounts.form.editTitle") : t("accounts.form.createTitle")}</DialogTitle>
              <DialogDescription>{t("accounts.security")}</DialogDescription>
            </DialogHeader>

            <FormField label={t("accounts.form.alias")} hint={t("accounts.form.aliasHint")} error={fieldMessage(errors.alias?.message)}>
              {(field) => <Input {...field} maxLength={60} autoComplete="off" placeholder={t("accounts.form.aliasPlaceholder")} {...register("alias")} />}
            </FormField>

            <FormField
              label={t("accounts.form.clabe")}
              error={fieldMessage(errors.clabe?.message)}
              hint={
                loading ? (
                  t("accounts.form.loading")
                ) : check?.ok ? (
                  <span className="flex items-center gap-1.5 text-owed">
                    <CircleCheck className="size-3.5" aria-hidden />
                    {t("accounts.form.clabeValid")}
                    {check.bankName ? ` · ${t("accounts.form.clabeBank", { bank: check.bankName })}` : ""}
                  </span>
                ) : check && check.error !== "length" ? (
                  <span className="text-destructive">{t(`validation.${check.error === "digits" ? "clabeDigits" : "clabeChecksum"}`)}</span>
                ) : undefined
              }
            >
              {(field) => (
                <Input
                  {...field}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={24}
                  className="font-mono tracking-wide"
                  {...register("clabe", {
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                      const result = validateClabe(event.target.value);
                      if (result.ok && result.bankName && !getValues("bankName")) setValue("bankName", result.bankName);
                    },
                  })}
                />
              )}
            </FormField>

            <FormField label={t("accounts.form.bank")} error={fieldMessage(errors.bankName?.message)}>
              {(field) => <Input {...field} maxLength={80} autoComplete="off" {...register("bankName")} />}
            </FormField>
            <FormField label={t("accounts.form.holder")} error={fieldMessage(errors.holderName?.message)}>
              {(field) => <Input {...field} maxLength={120} autoComplete="name" {...register("holderName")} />}
            </FormField>
            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <FormField label={t("accounts.form.accountNumber")} hint={t("accounts.form.accountHint")} error={fieldMessage(errors.accountNumber?.message)} optional optionalLabel={t("common.optional")}>
                {(field) => <Input {...field} inputMode="numeric" autoComplete="off" maxLength={40} className="font-mono" {...register("accountNumber")} />}
              </FormField>
              <FormField label={t("accounts.form.currency")}>
                {(field) => (
                  <NativeSelect {...field} {...register("currency")}>
                    {CURRENCY_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </div>
            <label className="flex items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 rounded border-input accent-[var(--primary)]" {...register("isPreferred")} />
              {t("accounts.form.preferred")}
            </label>

            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending || loading} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
