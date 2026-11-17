"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useAction } from "@/components/shared/use-action";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";

type ButtonProps = React.ComponentProps<typeof Button>;

interface TriggerProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  /** Accessible name when the visible label is not enough (icon-only triggers). */
  ariaLabel?: string;
}

/** A button that asks "are you sure?" before running a server action. */
export function ConfirmButton<T>({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
  successMessage,
  onDone,
}: {
  trigger: TriggerProps;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  action: () => Promise<ActionResult<T>>;
  successMessage?: string;
  onDone?: (data: T) => void;
}) {
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);
  const { run, pending } = useAction();

  return (
    <>
      <Button type="button" variant={trigger.variant ?? "outline"} size={trigger.size ?? "sm"} className={trigger.className} aria-label={trigger.ariaLabel} onClick={() => setOpen(true)}>
        {trigger.icon}
        {trigger.label}
      </Button>
      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              disabled={pending}
              aria-busy={pending}
              onClick={() =>
                run(action, {
                  successMessage,
                  onSuccess: (data) => {
                    setOpen(false);
                    onDone?.(data);
                  },
                })
              }
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel ?? t("confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A button that asks for a written reason (or message) and sends it with a server action. */
export function ReasonButton<T>({
  trigger,
  title,
  description,
  label,
  placeholder,
  required = true,
  confirmLabel,
  destructive = false,
  action,
  successMessage,
  onDone,
}: {
  trigger: TriggerProps;
  title: string;
  description?: React.ReactNode;
  label: string;
  placeholder?: string;
  required?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  action: (text: string) => Promise<ActionResult<T>>;
  successMessage?: string;
  onDone?: (data: T) => void;
}) {
  const t = useTranslations();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const { run, pending, fieldMessage } = useAction();

  const submit = () => {
    if (required && !text.trim()) {
      setError(t("validation.required"));
      return;
    }
    run(() => action(text.trim()), {
      successMessage,
      onSuccess: (data) => {
        setOpen(false);
        setText("");
        onDone?.(data);
      },
      onError: (failure) => {
        const key = failure.fields ? Object.values(failure.fields)[0] : undefined;
        if (key) setError(fieldMessage(key));
        return false;
      },
    });
  };

  return (
    <>
      <Button type="button" variant={trigger.variant ?? "outline"} size={trigger.size ?? "sm"} className={trigger.className} aria-label={trigger.ariaLabel} onClick={() => setOpen(true)}>
        {trigger.icon}
        {trigger.label}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>
                {label}
                {!required && <span className="font-normal text-muted-foreground"> · {t("common.optional")}</span>}
              </Label>
              <Textarea
                id={id}
                rows={4}
                maxLength={1000}
                placeholder={placeholder}
                value={text}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => {
                  setText(event.target.value);
                  setError(undefined);
                }}
              />
              {error && (
                <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {confirmLabel ?? t("common.send")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A plain button that runs a server action straight away. */
export function ActionButton<T>({
  action,
  successMessage,
  onDone,
  children,
  ...props
}: Omit<ButtonProps, "onClick"> & {
  action: () => Promise<ActionResult<T>>;
  successMessage?: string;
  onDone?: (data: T) => void;
}) {
  const { run, pending } = useAction();
  return (
    <Button type="button" {...props} disabled={pending || props.disabled} aria-busy={pending} onClick={() => run(action, { successMessage, onSuccess: onDone })}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
