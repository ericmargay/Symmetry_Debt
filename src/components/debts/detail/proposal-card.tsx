"use client";

import { Check, MessageSquareDiff, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { decideVersionAction } from "@/actions/agreements";
import { TermsSummary } from "@/components/debts/detail/terms-summary";
import { ActionButton, ConfirmButton, ReasonButton } from "@/components/shared/dialogs";
import { WeightBadge } from "@/components/shared/weight-badge";
import type { VersionView } from "@/server/services/views";

/**
 * The terms that are on the table, with what changed and the buttons to answer.
 * Whoever proposed them only gets "withdraw": nobody accepts their own proposal.
 */
export function ProposalCard({ debtId, version, counterpartyName }: { debtId: string; version: VersionView; counterpartyName: string }) {
  const t = useTranslations();
  const decide = (action: "accept" | "reject" | "request_changes" | "withdraw", comment?: string) =>
    decideVersionAction(debtId, { versionId: version.id, termsHash: version.termsHash, action, comment });
  const amendment = version.kind === "AMENDMENT";

  return (
    <section aria-labelledby="proposal-title" className="rounded-2xl border border-waiting/50 bg-card p-5 sm:p-6" data-testid="proposal">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 id="proposal-title" className="text-base font-semibold">
          {t("detail.proposal.title")} · {t("detail.proposal.version", { number: version.number })}
        </h2>
        <WeightBadge weight="proposal" />
      </div>
      <p className="text-sm text-muted-foreground">{version.proposedByMe ? t("detail.proposal.byMe") : t("detail.proposal.byOther", { name: version.proposedByName })}</p>

      {version.changeNote && (
        <blockquote className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <span className="block text-xs text-muted-foreground">{t("detail.proposal.note")}</span>
          <span className="whitespace-pre-line">{version.changeNote}</span>
        </blockquote>
      )}

      {version.changes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">{t("detail.proposal.changes")}</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {version.changes.map((field) => (
              <li key={field} className="rounded-full bg-waiting-soft px-2.5 py-0.5 text-xs font-medium text-waiting">
                {t(`detail.proposal.field.${field}`)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <TermsSummary terms={version.terms} />
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {version.actions.includes("accept") ? (
          <>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={() => decide("accept")}>
                <Check aria-hidden />
                {t("detail.proposal.accept")}
              </ActionButton>
              <ReasonButton
                trigger={{ label: t("detail.proposal.requestChanges"), icon: <MessageSquareDiff aria-hidden />, size: "default" }}
                title={t("detail.proposal.requestChangesTitle")}
                label={t("common.comment")}
                action={(text) => decide("request_changes", text)}
              />
              <ReasonButton
                trigger={{ label: t("detail.proposal.reject"), icon: <X aria-hidden />, variant: "ghost", size: "default" }}
                title={t("detail.proposal.rejectTitle")}
                description={amendment ? t("detail.proposal.rejectAmendmentHint") : t("detail.proposal.rejectInitialHint")}
                label={t("common.reason")}
                required={false}
                confirmLabel={t("detail.proposal.reject")}
                destructive
                action={(text) => decide("reject", text)}
              />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("detail.proposal.acceptHint")}</p>
          </>
        ) : version.actions.includes("withdraw") ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("detail.proposal.waiting", { name: counterpartyName })}</p>
            <ConfirmButton
              trigger={{ label: t("detail.actions.withdrawProposal"), variant: "ghost" }}
              title={t("detail.actions.withdrawProposal")}
              description={amendment ? t("detail.proposal.withdrawConfirmAmendment") : t("detail.proposal.withdrawConfirmInitial")}
              confirmLabel={t("detail.actions.withdrawProposal")}
              destructive
              action={() => decide("withdraw")}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
