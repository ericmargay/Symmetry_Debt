"use client";

import { ArrowDownRight, ArrowUpRight, Check, HelpCircle, MessageSquareReply, Pencil, Plus, Reply, RotateCcw, SlidersHorizontal, Trash2, Undo2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { decideMovementAction, deleteMovementAction } from "@/actions/movements";
import { AttachmentList, UploadButton } from "@/components/debts/detail/attachments";
import { MovementDialog, type MovementFormContext, type MovementFormKind, type MovementToEdit } from "@/components/debts/detail/movement-form";
import { DateText, DateTimeText } from "@/components/shared/dates";
import { ConfirmButton, ReasonButton } from "@/components/shared/dialogs";
import { Money } from "@/components/shared/money";
import { MovementStatusBadge } from "@/components/shared/status-badge";
import { WeightMark, type Weight } from "@/components/shared/weight-badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import type { MovementView } from "@/server/services/views";

const WEIGHT: Partial<Record<MovementView["status"], Weight>> = {
  PERSONAL_RECORD: "personal",
  PENDING: "one_side",
  CLARIFICATION: "one_side",
  CONFIRMED: "both_sides",
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export function MovementsSection({
  movements,
  context,
  timeZone,
  canRecordPayment,
  canRecordAdjustment,
  canAttach,
}: {
  movements: MovementView[];
  context: MovementFormContext;
  timeZone: string;
  canRecordPayment: boolean;
  canRecordAdjustment: boolean;
  canAttach: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale() as Locale;
  const intlLocale = intlLocales[locale] ?? intlLocales.es;
  const isShared = context.mode === "SHARED";
  const [dialog, setDialog] = useState<{ kind: MovementFormKind; edit?: MovementToEdit; reversal?: { id: string; amountMinor: bigint } } | null>(null);

  return (
    <section aria-labelledby="movements-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="movements-title" className="text-base font-semibold">
          {t("detail.movements.title")}
        </h2>
        <div className="flex flex-wrap gap-2">
          {canRecordAdjustment && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDialog({ kind: "ADJUSTMENT" })}>
              <SlidersHorizontal aria-hidden />
              {t("detail.actions.recordAdjustment")}
            </Button>
          )}
          {canRecordPayment && (
            <Button type="button" size="sm" onClick={() => setDialog({ kind: "PAYMENT" })}>
              <Plus aria-hidden />
              {t("detail.actions.recordPayment")}
            </Button>
          )}
        </div>
      </div>

      {movements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{t("detail.movements.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {movements.map((movement) => {
            const reduces = movement.kind === "PAYMENT" || movement.kind === "ADJUSTMENT_DECREASE";
            const dimmed = movement.status === "REJECTED" || movement.status === "WITHDRAWN";
            const weight = WEIGHT[movement.status];
            const amount = formatMoney(movement.amountMinor, context.currency, intlLocale);
            const waitingText =
              movement.status === "PENDING"
                ? movement.recordedByMe
                  ? t("detail.movements.waitingOther", { name: context.counterpartyName })
                  : t("detail.movements.waitingYou")
                : movement.status === "CLARIFICATION"
                  ? movement.recordedByMe
                    ? t("detail.movements.needsClarification", { name: context.counterpartyName })
                    : t("detail.movements.youAsked")
                  : null;
            const needsMe = movement.actions.includes("approve") || movement.actions.includes("clarify");

            return (
              <li key={movement.id} className={cn("rounded-xl border p-4", needsMe ? "border-waiting/50 bg-waiting-soft/40" : "border-border", dimmed && "opacity-70")} data-testid="movement">
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", reduces ? "bg-owed-soft text-owed" : "bg-owe-soft text-owe")} aria-hidden>
                    {movement.kind === "REVERSAL" ? <Undo2 className="size-4" /> : reduces ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-medium">{t(`labels.movementKind.${movement.kind}`)}</p>
                      <Money minor={movement.amountMinor} currency={context.currency} sign={reduces ? "−" : "+"} className={cn("text-base font-semibold", dimmed && "line-through")} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        {weight && <WeightMark weight={weight} />}
                        <MovementStatusBadge status={movement.status} />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        <DateText iso={movement.effectiveDate} />
                      </span>
                      {movement.reversal && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {movement.reversal.status === "CONFIRMED" ? t("detail.movements.reversed") : t("detail.movements.reversalPending")}
                        </span>
                      )}
                    </div>
                    {waitingText && <p className="mt-2 text-sm font-medium text-waiting">{waitingText}</p>}

                    <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                      {movement.method && <Detail label={t("detail.movements.method")}>{t(`labels.method.${movement.method}`)}</Detail>}
                      {movement.reference && <Detail label={t("detail.movements.reference")}>{movement.reference}</Detail>}
                      {movement.place && <Detail label={t("detail.movements.place")}>{movement.place}</Detail>}
                      {movement.bank?.originBank && <Detail label={t("detail.movements.originBank")}>{movement.bank.originBank}</Detail>}
                      {movement.bank?.destinationLabel && <Detail label={t("detail.movements.destination")}>{movement.bank.destinationLabel}</Detail>}
                      {movement.bank?.trackingKey && (
                        <Detail label={t("detail.movements.trackingKey")}>
                          <span className="font-mono text-xs">{movement.bank.trackingKey}</span>
                        </Detail>
                      )}
                      {movement.notes && (
                        <div className="sm:col-span-2">
                          <Detail label={t("detail.movements.notes")}>
                            <span className="whitespace-pre-line">{movement.notes}</span>
                          </Detail>
                        </div>
                      )}
                    </dl>

                    <p className="mt-3 text-xs text-muted-foreground">
                      {movement.origin === "HISTORICAL"
                        ? t("detail.movements.historical")
                        : movement.recordedByMe
                          ? t("detail.movements.recordedByMe")
                          : t("detail.movements.recordedBy", { name: movement.recordedByName })}
                      {" · "}
                      <DateTimeText date={movement.recordedAt} timeZone={timeZone} />
                      {movement.kind === "REVERSAL" && ` · ${t("detail.movements.reverses")}`}
                    </p>

                    {/* What each side said, in order. The recorder's first "confirmed" is the recording itself. */}
                    {movement.approvals.filter((approval, index) => index > 0 || approval.comment).length > 0 && (
                      <ol className="mt-3 flex flex-col gap-1.5 border-l-2 border-border pl-3" aria-label={t("detail.movements.answers")}>
                        {movement.approvals
                          .filter((approval, index) => index > 0 || approval.comment)
                          .map((approval, index) => (
                            <li key={index} className="text-sm">
                              <span className="font-medium">
                                {t(`detail.movements.decision.${approval.decision as "APPROVED"}`, { by: approval.byMe ? "me" : "other", name: context.counterpartyName })}
                              </span>
                              {approval.comment && <span className="mt-0.5 block text-muted-foreground">“{approval.comment}”</span>}
                            </li>
                          ))}
                      </ol>
                    )}

                    {movement.attachments.length > 0 && (
                      <div className="mt-3">
                        <AttachmentList items={movement.attachments} compact />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
                      {movement.actions.includes("approve") && (
                        <ConfirmButton
                          trigger={{ label: t("detail.movements.approve"), icon: <Check aria-hidden />, variant: "default" }}
                          title={t("detail.movements.approveConfirmTitle")}
                          description={t("detail.movements.approveConfirm", { amount })}
                          confirmLabel={t("detail.movements.approve")}
                          action={() => decideMovementAction(movement.id, "approve")}
                        />
                      )}
                      {movement.actions.includes("ask") && (
                        <ReasonButton
                          trigger={{ label: t("detail.movements.ask"), icon: <HelpCircle aria-hidden /> }}
                          title={t("detail.movements.askTitle")}
                          description={t("detail.movements.askHint")}
                          label={t("detail.movements.commentLabel")}
                          action={(text) => decideMovementAction(movement.id, "ask", text)}
                        />
                      )}
                      {movement.actions.includes("reject") && (
                        <ReasonButton
                          trigger={{ label: t("detail.movements.reject"), icon: <X aria-hidden /> }}
                          title={t("detail.movements.rejectTitle")}
                          description={t("detail.movements.rejectHint")}
                          label={t("common.reason")}
                          confirmLabel={t("detail.movements.reject")}
                          destructive
                          action={(text) => decideMovementAction(movement.id, "reject", text)}
                        />
                      )}
                      {movement.actions.includes("clarify") && (
                        <ReasonButton
                          trigger={{ label: t("detail.movements.clarify"), icon: <MessageSquareReply aria-hidden />, variant: "default" }}
                          title={t("detail.movements.clarifyTitle")}
                          label={t("detail.movements.commentLabel")}
                          action={(text) => decideMovementAction(movement.id, "clarify", text)}
                        />
                      )}
                      {movement.actions.includes("withdraw") && (
                        <ConfirmButton
                          trigger={{ label: t("detail.movements.withdraw"), icon: <Reply aria-hidden />, variant: "ghost" }}
                          title={t("detail.movements.withdraw")}
                          description={t("detail.movements.withdrawConfirm")}
                          confirmLabel={t("detail.movements.withdraw")}
                          action={() => decideMovementAction(movement.id, "withdraw")}
                        />
                      )}
                      {movement.canEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDialog({
                              kind: movement.kind === "PAYMENT" ? "PAYMENT" : "ADJUSTMENT",
                              edit: {
                                id: movement.id,
                                kind: movement.kind,
                                amountMinor: movement.amountMinor,
                                effectiveDate: movement.effectiveDate,
                                method: movement.method,
                                reference: movement.reference,
                                notes: movement.notes,
                                place: movement.place,
                                originBank: movement.bank?.originBank ?? null,
                                destinationAccountId: movement.bank?.destinationAccountId ?? null,
                                destinationLabel: movement.bank?.destinationLabel ?? null,
                                trackingKey: movement.bank?.trackingKey ?? null,
                              },
                            })
                          }
                        >
                          <Pencil aria-hidden />
                          {t("detail.movements.edit")}
                        </Button>
                      )}
                      {movement.canDelete && (
                        <ConfirmButton
                          trigger={{ label: t("detail.movements.delete"), icon: <Trash2 aria-hidden />, variant: "ghost" }}
                          title={t("detail.movements.deleteConfirm")}
                          description={amount}
                          confirmLabel={t("common.delete")}
                          destructive
                          action={() => deleteMovementAction(movement.id)}
                        />
                      )}
                      {movement.canReverse && (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ kind: "REVERSAL", reversal: { id: movement.id, amountMinor: movement.amountMinor } })}>
                          <RotateCcw aria-hidden />
                          {t("detail.movements.reverse")}
                        </Button>
                      )}
                      {canAttach && movement.status !== "REJECTED" && movement.status !== "WITHDRAWN" && movement.origin === "RECORDED" && (
                        <UploadButton debtId={context.debtId} paymentId={movement.id} maxUploadMb={context.maxUploadMb} variant="ghost" />
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isShared && movements.some((movement) => movement.attachments.length > 0) && (
        <p className="mt-4 text-xs text-muted-foreground">{t("detail.attachments.notProof")}</p>
      )}

      <MovementDialog
        key={dialog ? `${dialog.kind}-${dialog.edit?.id ?? dialog.reversal?.id ?? "new"}` : "closed"}
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        context={context}
        kind={dialog?.kind ?? "PAYMENT"}
        edit={dialog?.edit ?? null}
        reversal={dialog?.reversal ?? null}
      />
    </section>
  );
}
