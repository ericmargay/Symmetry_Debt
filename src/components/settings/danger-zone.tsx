"use client";

import { Download, Loader2, LogOut, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { toast } from "sonner";
import { deleteAccountAction, revokeOtherSessionsAction } from "@/actions/settings";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { withBasePath } from "@/lib/base-path";

export function SessionsButton() {
  const t = useTranslations("pages.settings.security");
  const { run, pending } = useAction();
  return (
    <Button type="button" variant="outline" disabled={pending} aria-busy={pending} onClick={() => run(() => revokeOtherSessionsAction(), { onSuccess: ({ count }) => toast.success(t("revoked", { count })) })}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      {t("revoke")}
    </Button>
  );
}

export function ExportButton() {
  const t = useTranslations("pages.settings.data");
  return (
    <Button asChild variant="outline">
      {/* A plain download link to the export endpoint: it needs no JavaScript. */}
      <a href={withBasePath("/api/export")} download>
        <Download aria-hidden />
        {t("export")}
      </a>
    </Button>
  );
}

/** Deleting the account asks the person to type their own email address. Nothing less. */
export function DeleteAccountButton({ email }: { email: string }) {
  const t = useTranslations();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const { run, pending, explain } = useAction();
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        {t("pages.settings.data.delete")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!matches) return;
              run(() => deleteAccountAction(typed), {
                onError: (failure) => {
                  setError(explain(failure));
                  return true;
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("pages.settings.data.deleteTitle")}</DialogTitle>
              <DialogDescription>{t("pages.settings.data.deleteText")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{t("pages.settings.data.deleteConfirmLabel", { email })}</Label>
              <Input
                id={id}
                type="email"
                autoComplete="off"
                value={typed}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setError(undefined);
                }}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={!matches || pending} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {t("pages.settings.data.delete")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
