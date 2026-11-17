"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { createContactAction, updateContactAction } from "@/actions/people";
import { FormField } from "@/components/shared/form-field";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contactInputSchema } from "@/schemas/contact";

type Values = z.input<typeof contactInputSchema>;

export interface ContactToEdit {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

/** Creates or edits a private contact. The same schema validates here and on the server. */
export function ContactFormButton({ contact, variant = "default" }: { contact?: ContactToEdit; variant?: "default" | "outline" }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { run, pending, fieldMessage } = useAction();
  const form = useForm<Values, unknown, z.output<typeof contactInputSchema>>({
    resolver: zodResolver(contactInputSchema),
    values: { name: contact?.name ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", notes: contact?.notes ?? "" },
  });
  const { register, handleSubmit, setError, reset, formState } = form;
  const errors = formState.errors;

  const onSubmit = handleSubmit((values) => {
    const input = { name: values.name, email: values.email, phone: values.phone, notes: values.notes };
    const onError = (failure: { fields?: Record<string, string> }) => {
      for (const [field, key] of Object.entries(failure.fields ?? {})) setError(field as keyof Values, { message: key });
      return false;
    };
    if (contact) {
      run(() => updateContactAction(contact.id, input), { successMessage: t("people.form.saved"), onSuccess: () => setOpen(false), onError });
    } else {
      run(() => createContactAction(input), {
        successMessage: t("people.form.saved"),
        onError,
        onSuccess: ({ id }) => {
          setOpen(false);
          reset();
          router.push(`/app/people/${id}`);
        },
      });
    }
  });

  return (
    <>
      <Button type="button" variant={contact ? "outline" : variant} size={contact ? "sm" : "default"} onClick={() => setOpen(true)}>
        {contact ? <Pencil aria-hidden /> : <UserPlus aria-hidden />}
        {contact ? t("people.detail.edit") : t("people.add")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{contact ? t("people.form.editTitle") : t("people.form.createTitle")}</DialogTitle>
              <DialogDescription>{t("people.form.privacy")}</DialogDescription>
            </DialogHeader>
            <FormField label={t("people.form.name")} error={fieldMessage(errors.name?.message)}>
              {(field) => <Input {...field} maxLength={80} autoComplete="off" {...register("name")} />}
            </FormField>
            <FormField label={t("people.form.email")} error={fieldMessage(errors.email?.message)} optional optionalLabel={t("common.optional")}>
              {(field) => <Input {...field} type="email" inputMode="email" autoComplete="off" {...register("email")} />}
            </FormField>
            <FormField label={t("people.form.phone")} error={fieldMessage(errors.phone?.message)} optional optionalLabel={t("common.optional")}>
              {(field) => <Input {...field} type="tel" inputMode="tel" autoComplete="off" maxLength={40} {...register("phone")} />}
            </FormField>
            <FormField label={t("people.form.notes")} hint={t("people.form.notesHint")} error={fieldMessage(errors.notes?.message)} optional optionalLabel={t("common.optional")}>
              {(field) => <Textarea {...field} rows={3} maxLength={1000} {...register("notes")} />}
            </FormField>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
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
