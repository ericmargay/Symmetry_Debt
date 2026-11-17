"use client";

import { Ban, EllipsisVertical, Flag, Link2, Loader2, Pencil, RotateCcw, Send, ShieldCheck, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import {
  answerCancellationAction,
  confirmIdentityAction,
  discardDraftAction,
  openDisputeAction,
  regenerateInvitationAction,
  removeCounterpartyAction,
  requestCancellationAction,
  resolveDisputeAction,
  revokeBankShareAction,
  sendDraftAction,
  setPrivateNoteAction,
  shareBankAccountAction,
  type IssuedLink,
} from "@/actions/agreements";
import { deletePersonalDebtAction, setPersonalDebtCancelledAction } from "@/actions/debts";
import { addCommentAction } from "@/actions/movements";
import { ShareLinkPanel } from "@/components/debts/share-link";
import { CopyButton } from "@/components/shared/copy-button";
import { ActionButton, ConfirmButton, ReasonButton } from "@/components/shared/dialogs";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatClabe } from "@/domain/clabe";

/** Shows a freshly issued share link. It cannot be shown again later, so it says so. */
function IssuedLinkDialog({ link, onClose }: { link: IssuedLink | null; onClose: () => void }) {
  const t = useTranslations("share");
  return (
    <Dialog open={link !== null && link.inviteToken !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {link?.inviteToken && <ShareLinkPanel token={link.inviteToken} emailedTo={link.emailedTo} />}
      </DialogContent>
    </Dialog>
  );
}

/** "Generate a new link": optional email, optional "email it too". */
export function NewLinkButton({ debtId, currentEmail, emailEnabled, variant = "outline" }: { debtId: string; currentEmail: string | null; emailEnabled: boolean; variant?: "outline" | "default" }) {
  const t = useTranslations();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [send, setSend] = useState(false);
  const [error, setError] = useState<string>();
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const { run, pending, fieldMessage } = useAction();

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        <Link2 aria-hidden />
        {t("detail.banner.newLink")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => regenerateInvitationAction(debtId, email.trim() || null, send && email.trim() !== ""), {
                onSuccess: (link) => {
                  setOpen(false);
                  setIssued(link);
                },
                onError: (failure) => {
                  if (failure.fields?.inviteEmail) setError(fieldMessage(failure.fields.inviteEmail));
                  return false;
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("detail.banner.newLink")}</DialogTitle>
              <DialogDescription>{t("detail.banner.newLinkConfirm")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{t("detail.banner.newLinkEmail")}</Label>
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                aria-invalid={error ? true : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(undefined);
                }}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{t("wizard.review.inviteEmailHint")}</p>
            </div>
            {emailEnabled && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={send} onChange={(event) => setSend(event.target.checked)} className="size-4 rounded border-input accent-[var(--primary)]" />
                {t("detail.banner.newLinkSend")}
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {t("detail.banner.newLink")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <IssuedLinkDialog link={issued} onClose={() => setIssued(null)} />
    </>
  );
}

/** "Is this the right person?" — the proposer confirms (or turns away) whoever used the link. */
export function IdentityActions({ debtId }: { debtId: string }) {
  const t = useTranslations("detail.banner");
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton size="sm" action={() => confirmIdentityAction(debtId)}>
        <ShieldCheck aria-hidden />
        {t("identityConfirm")}
      </ActionButton>
      <ConfirmButton
        trigger={{ label: t("identityReject"), icon: <UserX aria-hidden />, variant: "outline" }}
        title={t("identityReject")}
        description={t("identityRejectConfirm")}
        confirmLabel={t("identityReject")}
        destructive
        action={() => removeCounterpartyAction(debtId)}
        onDone={setIssued}
      />
      <IssuedLinkDialog link={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

export function DraftActions({ debtId, suggestedEmail, emailEnabled }: { debtId: string; suggestedEmail: string | null; emailEnabled: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(suggestedEmail ?? "");
  const [error, setError] = useState<string>();
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const { run, pending, fieldMessage } = useAction();

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Send aria-hidden />
        {t("detail.banner.sendDraft")}
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={`/app/debts/${debtId}/terms`}>
          <Pencil aria-hidden />
          {t("detail.banner.editDraft")}
        </Link>
      </Button>
      <ConfirmButton
        trigger={{ label: t("detail.banner.discardDraft"), icon: <Trash2 aria-hidden />, variant: "ghost" }}
        title={t("detail.banner.discardDraft")}
        description={t("detail.banner.discardConfirm")}
        confirmLabel={t("detail.banner.discardDraft")}
        destructive
        action={() => discardDraftAction(debtId)}
        onDone={() => router.replace("/app/debts")}
      />
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => sendDraftAction(debtId, email.trim() || null), {
                onSuccess: (link) => {
                  setOpen(false);
                  setIssued(link);
                },
                onError: (failure) => {
                  if (failure.fields?.inviteEmail) setError(fieldMessage(failure.fields.inviteEmail));
                  return false;
                },
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("detail.banner.sendDraft")}</DialogTitle>
              <DialogDescription>{t("wizard.review.acceptNotice")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id}>{t("detail.banner.newLinkEmail")}</Label>
              <Input id={id} type="email" inputMode="email" autoComplete="off" value={email} aria-invalid={error ? true : undefined} onChange={(event) => { setEmail(event.target.value); setError(undefined); }} />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">{emailEnabled ? t("wizard.review.inviteEmailHint") : t("wizard.review.inviteEmailHint")}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                {t("detail.banner.sendDraft")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <IssuedLinkDialog link={issued} onClose={() => setIssued(null)} />
    </div>
  );
}

export function DisputeActions({ debtId, canResolve }: { debtId: string; canResolve: boolean }) {
  const t = useTranslations("detail.banner");
  if (!canResolve) return null;
  return (
    <ReasonButton
      trigger={{ label: t("resolveDispute"), variant: "default" }}
      title={t("resolveDispute")}
      label={t("resolveNote")}
      required={false}
      confirmLabel={t("resolveDispute")}
      action={(text) => resolveDisputeAction(debtId, text || null)}
    />
  );
}

export function CancellationActions({ debtId, canAnswer, canWithdraw }: { debtId: string; canAnswer: boolean; canWithdraw: boolean }) {
  const t = useTranslations("detail.banner");
  return (
    <div className="flex flex-wrap gap-2">
      {canAnswer && (
        <>
          <ConfirmButton
            trigger={{ label: t("cancelAccept"), variant: "default" }}
            title={t("cancelAccept")}
            confirmLabel={t("cancelAccept")}
            destructive
            action={() => answerCancellationAction(debtId, "accept")}
          />
          <ActionButton variant="outline" size="sm" action={() => answerCancellationAction(debtId, "decline")}>
            {t("cancelDecline")}
          </ActionButton>
        </>
      )}
      {canWithdraw && (
        <ActionButton variant="outline" size="sm" action={() => answerCancellationAction(debtId, "withdraw")}>
          {t("cancelWithdraw")}
        </ActionButton>
      )}
    </div>
  );
}

export interface DebtMenuProps {
  debtId: string;
  counterpartyName: string;
  can: {
    edit: boolean;
    delete: boolean;
    cancelPersonal: boolean;
    reopenPersonal: boolean;
    proposeTerms: boolean;
    openDispute: boolean;
    requestCancellation: boolean;
  };
  /** Shared and not in force yet: cancelling just closes the proposal. */
  negotiating: boolean;
}

/** Secondary actions, tucked away so the page stays about the debt itself. */
export function DebtMenu({ debtId, counterpartyName, can, negotiating }: DebtMenuProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run } = useAction();
  const [dialog, setDialog] = useState<"delete" | "cancelPersonal" | "dispute" | "cancelShared" | null>(null);
  const any = Object.values(can).some(Boolean);
  if (!any) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" aria-label={t("detail.moreActions")}>
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {can.edit && (
            <DropdownMenuItem asChild>
              <Link href={`/app/debts/${debtId}/terms`}>
                <Pencil aria-hidden />
                {t("detail.actions.edit")}
              </Link>
            </DropdownMenuItem>
          )}
          {can.proposeTerms && (
            <DropdownMenuItem asChild>
              <Link href={`/app/debts/${debtId}/terms`}>
                <Pencil aria-hidden />
                {negotiating ? t("detail.actions.proposeNewTerms") : t("detail.actions.proposeChanges")}
              </Link>
            </DropdownMenuItem>
          )}
          {can.reopenPersonal && (
            <DropdownMenuItem onSelect={() => run(() => setPersonalDebtCancelledAction(debtId, false))}>
              <RotateCcw aria-hidden />
              {t("detail.actions.reopen")}
            </DropdownMenuItem>
          )}
          {can.openDispute && (
            <DropdownMenuItem onSelect={() => setDialog("dispute")}>
              <Flag aria-hidden />
              {t("detail.actions.openDispute")}
            </DropdownMenuItem>
          )}
          {(can.cancelPersonal || can.requestCancellation || can.delete) && <DropdownMenuSeparator />}
          {can.cancelPersonal && (
            <DropdownMenuItem onSelect={() => setDialog("cancelPersonal")}>
              <Ban aria-hidden />
              {t("detail.actions.cancel")}
            </DropdownMenuItem>
          )}
          {can.requestCancellation && (
            <DropdownMenuItem onSelect={() => setDialog("cancelShared")}>
              <Ban aria-hidden />
              {t("detail.actions.requestCancellation")}
            </DropdownMenuItem>
          )}
          {can.delete && (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
              <Trash2 aria-hidden />
              {t("detail.actions.delete")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ControlledConfirm
        open={dialog === "cancelPersonal"}
        onClose={() => setDialog(null)}
        title={t("detail.actions.cancel")}
        description={t("detail.confirm.cancelPersonal")}
        confirmLabel={t("detail.actions.cancel")}
        action={() => setPersonalDebtCancelledAction(debtId, true)}
      />
      <ControlledConfirm
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        title={t("detail.confirm.deletePersonalTitle")}
        description={t("detail.confirm.deletePersonal")}
        confirmLabel={t("common.delete")}
        destructive
        action={() => deletePersonalDebtAction(debtId)}
        onDone={() => router.replace("/app/debts")}
      />
      <ControlledReason
        open={dialog === "dispute"}
        onClose={() => setDialog(null)}
        title={t("detail.confirm.disputeTitle")}
        description={t("detail.confirm.disputeText")}
        label={t("common.reason")}
        confirmLabel={t("detail.actions.openDispute")}
        action={(text) => openDisputeAction(debtId, text)}
      />
      <ControlledReason
        open={dialog === "cancelShared"}
        onClose={() => setDialog(null)}
        title={t("detail.confirm.cancelSharedTitle")}
        description={negotiating ? t("detail.confirm.cancelSharedNegotiating") : t("detail.confirm.cancelSharedActive", { name: counterpartyName })}
        label={t("common.reason")}
        confirmLabel={t("detail.actions.requestCancellation")}
        destructive
        action={(text) => requestCancellationAction(debtId, text)}
      />
    </>
  );
}

type ActionReturn = ReturnType<typeof setPersonalDebtCancelledAction>;

function ControlledConfirm({ open, onClose, title, description, confirmLabel, destructive, action, onDone }: { open: boolean; onClose: () => void; title: string; description: string; confirmLabel: string; destructive?: boolean; action: () => ActionReturn; onDone?: () => void }) {
  const t = useTranslations("common");
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            aria-busy={pending}
            onClick={() =>
              run(action, {
                onSuccess: () => {
                  onClose();
                  onDone?.();
                },
              })
            }
          >
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ControlledReason({ open, onClose, title, description, label, confirmLabel, destructive, action }: { open: boolean; onClose: () => void; title: string; description: string; label: string; confirmLabel: string; destructive?: boolean; action: (text: string) => ActionReturn }) {
  const t = useTranslations();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const { run, pending } = useAction();
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) {
              setError(t("validation.required"));
              return;
            }
            run(() => action(text.trim()), {
              onSuccess: () => {
                setText("");
                onClose();
              },
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            <Textarea id={id} rows={4} maxLength={1000} value={text} aria-invalid={error ? true : undefined} onChange={(event) => { setText(event.target.value); setError(undefined); }} />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending} aria-busy={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A comment on the timeline. */
export function CommentBox({ debtId, hint }: { debtId: string; hint: string }) {
  const t = useTranslations("detail.timeline");
  const [text, setText] = useState("");
  const { run, pending } = useAction();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        run(() => addCommentAction(debtId, text), { onSuccess: () => setText("") });
      }}
    >
      <Textarea rows={2} maxLength={1000} placeholder={t("commentPlaceholder")} aria-label={t("commentPlaceholder")} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{hint}</span>
        <Button type="submit" size="sm" variant="outline" disabled={pending || !text.trim()} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("post")}
        </Button>
      </div>
    </form>
  );
}

/** A participant's own note on a shared agreement. Nobody else can read it. */
export function PrivateNoteEditor({ debtId, initial }: { debtId: string; initial: string | null }) {
  const t = useTranslations();
  const [text, setText] = useState(initial ?? "");
  const { run, pending } = useAction();
  const dirty = text.trim() !== (initial ?? "").trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => setPrivateNoteAction(debtId, text.trim() || null), { successMessage: t("common.saved") });
      }}
    >
      <Textarea rows={2} maxLength={2000} placeholder={t("detail.terms.privateNotePlaceholder")} aria-label={t("detail.terms.privateNote")} value={text} onChange={(event) => setText(event.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{t("detail.terms.privateNoteHint")}</span>
        {dirty && (
          <Button type="submit" size="sm" variant="outline" disabled={pending} aria-busy={pending}>
            {t("common.save")}
          </Button>
        )}
      </div>
    </form>
  );
}

export interface SharedDetails {
  accountId: string;
  bankName: string;
  holderName: string;
  currency: string;
  clabe: string | null;
  accountNumber: string | null;
}

/** Bank details the other side shared so the reader can pay them, each one copyable. */
export function SharedBankDetailsList({ details }: { details: SharedDetails[] }) {
  const t = useTranslations("detail.bank");
  return (
    <ul className="flex flex-col gap-3">
      {details.map((detail) => {
        const all = [detail.bankName, detail.holderName, detail.clabe ? `CLABE ${detail.clabe}` : null, detail.accountNumber ? `${t("account")} ${detail.accountNumber}` : null]
          .filter(Boolean)
          .join("\n");
        return (
          <li key={detail.accountId} className="rounded-xl border border-border p-3">
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("bank")}</dt>
                <dd className="text-right font-medium">
                  {detail.bankName} · {detail.currency}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{t("holder")}</dt>
                <dd className="text-right font-medium">{detail.holderName}</dd>
              </div>
              {detail.clabe && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{t("clabe")}</dt>
                  <dd className="flex items-center gap-1 font-mono text-xs">
                    {formatClabe(detail.clabe)}
                    <CopyButton value={detail.clabe} label={t("clabe")} iconOnly variant="ghost" />
                  </dd>
                </div>
              )}
              {detail.accountNumber && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">{t("account")}</dt>
                  <dd className="flex items-center gap-1 font-mono text-xs">
                    {detail.accountNumber}
                    <CopyButton value={detail.accountNumber} label={t("account")} iconOnly variant="ghost" />
                  </dd>
                </div>
              )}
            </dl>
            <CopyButton value={all} label={t("copyAll")} className="mt-3" />
          </li>
        );
      })}
    </ul>
  );
}

/** The creditor's side: which of their accounts are shared here, and sharing another one. */
export function BankSharePanel({
  debtId,
  counterpartyName,
  shares,
  accounts,
}: {
  debtId: string;
  counterpartyName: string;
  shares: Array<{ accountId: string; alias: string; label: string }>;
  accounts: Array<{ id: string; alias: string; label: string }>;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const available = accounts.filter((account) => !shares.some((share) => share.accountId === account.id));
  const [selected, setSelected] = useState(available[0]?.id ?? "");
  const { run, pending } = useAction();

  return (
    <div className="flex flex-col gap-3">
      {shares.length > 0 && (
        <ul className="flex flex-col gap-2">
          {shares.map((share) => (
            <li key={share.accountId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{share.alias}</span>
                <span className="block text-xs text-muted-foreground">{share.label}</span>
              </span>
              <ActionButton variant="ghost" size="sm" action={() => revokeBankShareAction(debtId, share.accountId)}>
                {t("detail.bank.stop")}
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("detail.bank.noAccounts")}{" "}
          <Link href="/app/accounts" className="rounded text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t("detail.bank.addAccount")}
          </Link>
        </p>
      ) : (
        available.length > 0 && (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              {t("detail.bank.share")}
            </Button>
          </div>
        )
      )}

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("detail.bank.shareTitle")}</DialogTitle>
            <DialogDescription>{t("detail.bank.shareText", { name: counterpartyName })}</DialogDescription>
          </DialogHeader>
          <NativeSelect aria-label={t("wizard.plan.chooseAccount")} value={selected} onChange={(event) => setSelected(event.target.value)}>
            {available.map((account) => (
              <option key={account.id} value={account.id}>
                {account.alias} · {account.label}
              </option>
            ))}
          </NativeSelect>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" disabled={pending || !selected} aria-busy={pending} onClick={() => run(() => shareBankAccountAction(debtId, selected), { onSuccess: () => setOpen(false) })}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {t("detail.bank.shareConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
