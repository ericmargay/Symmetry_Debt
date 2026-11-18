"use client";

import { Check, MessageSquareDiff, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { respondToInvitationAction } from "@/actions/agreements";
import { ActionButton, ReasonButton } from "@/components/shared/dialogs";

/** Accept / ask for changes / reject, for somebody answering through an invitation. */
export function InvitationResponse({ invitationKey, versionId, termsHash, proposerName }: { invitationKey: string; versionId: string; termsHash: string; proposerName: string }) {
  const t = useTranslations("invite");
  const common = useTranslations("common");
  const router = useRouter();
  const respond = (action: "accept" | "reject" | "request_changes", comment?: string) =>
    respondToInvitationAction(invitationKey, { versionId, termsHash, action, comment });

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <ActionButton
        size="lg"
        className="sm:min-w-56"
        action={() => respond("accept")}
        onDone={(outcome) => {
          toast.success(outcome.awaitingIdentity ? t("acceptedWaiting", { name: proposerName }) : t("accepted"));
          router.replace(outcome.debtId ? `/app/debts/${outcome.debtId}` : "/app");
        }}
      >
        <Check aria-hidden />
        {t("accept")}
      </ActionButton>
      <ReasonButton
        trigger={{ label: t("requestChanges"), icon: <MessageSquareDiff aria-hidden />, size: "lg" }}
        title={t("requestChangesTitle")}
        label={common("comment")}
        action={(text) => respond("request_changes", text)}
        onDone={(outcome) => {
          toast.success(t("changesSent"));
          router.replace(outcome.debtId ? `/app/debts/${outcome.debtId}` : "/app");
        }}
      />
      <ReasonButton
        trigger={{ label: t("reject"), icon: <X aria-hidden />, variant: "ghost", size: "lg" }}
        title={t("rejectTitle")}
        description={t("rejectHint", { name: proposerName })}
        label={common("reason")}
        required={false}
        confirmLabel={t("reject")}
        destructive
        action={(text) => respond("reject", text)}
        onDone={() => {
          toast.success(t("rejected"));
          router.replace("/app");
        }}
      />
    </div>
  );
}
