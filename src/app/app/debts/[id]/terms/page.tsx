import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { ScheduleDraft } from "@/components/debts/schedule-editor";
import { TermsForm, type TermsFormVariant } from "@/components/debts/terms-form";
import { PageHeader } from "@/components/shared/page-header";
import { todayInTimeZone } from "@/domain/dates";
import { toInputValue } from "@/domain/money";
import type { TermsSnapshot } from "@/domain/terms";
import { isAppError } from "@/server/errors";
import { listBankAccounts, maskedLabel } from "@/server/services/bank-accounts";
import { listContactOptions } from "@/server/services/contacts";
import { getDebtView } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("termsForm"))("metaPropose") };
}

function scheduleDraft(terms: TermsSnapshot): ScheduleDraft {
  const installments = terms.installments.map((installment) => ({
    dueDate: installment.dueDate,
    amount: toInputValue(BigInt(installment.amountMinor), terms.currency),
  }));
  return {
    type: terms.scheduleType,
    firstDate: installments[0]?.dueDate ?? "",
    count: String(Math.max(installments.length, 2)),
    installments: terms.scheduleType === "CUSTOM" ? installments : [],
  };
}

export default async function TermsPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor, t] = await Promise.all([params, requireActor(), getTranslations("termsForm")]);
  const view = await getDebtView(actor, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });

  let variant: TermsFormVariant;
  if (view.can.edit) variant = "personal";
  else if (view.can.editDraft) variant = "draft";
  else if (view.can.proposeTerms) variant = view.termsAreProposal ? "counter" : "amendment";
  else redirect(`/app/debts/${view.id}`);

  // While negotiating, start from what is on the table (or was last proposed).
  const terms = variant === "amendment" ? (view.shared?.current?.terms ?? view.terms) : view.terms;
  const [contacts, accounts] = variant === "personal" ? await Promise.all([listContactOptions(actor), listBankAccounts(actor)]) : [[], []];
  const titles = { personal: t("titlePersonal"), draft: t("titleDraft"), counter: t("titleCounter"), amendment: t("titleAmendment") };
  const intros = {
    personal: t("introPersonal"),
    draft: t("introDraft"),
    counter: t("introCounter", { name: view.counterparty.name }),
    amendment: t("introAmendment", { name: view.counterparty.name }),
  };

  return (
    <>
      <PageHeader back={{ href: `/app/debts/${view.id}`, label: view.terms.concept }} title={titles[variant]} description={intros[variant]} className="mx-auto max-w-2xl" />
      <TermsForm
        debtId={view.id}
        variant={variant}
        counterpartyName={view.counterparty.name}
        today={todayInTimeZone(actor.timeZone)}
        contacts={contacts.map((contact) => ({ id: contact.id, name: contact.name }))}
        accounts={accounts.map((account) => ({ id: account.id, alias: account.alias, label: maskedLabel(account) }))}
        initial={{
          concept: terms.concept,
          currency: terms.currency,
          amount: toInputValue(BigInt(terms.principalMinor), terms.currency),
          originDate: terms.originDate,
          schedule: scheduleDraft(variant === "amendment" ? view.terms : terms),
          plannedMethod: terms.plannedMethod ?? "",
          notes: (variant === "personal" ? view.personal?.privateNotes : terms.sharedNotes) ?? "",
          previousPayments: terms.historicalPayments.map((payment) => ({
            amount: toInputValue(BigInt(payment.amountMinor), terms.currency),
            effectiveDate: payment.effectiveDate,
            method: payment.method ?? "",
            note: payment.note ?? "",
          })),
          myRole: view.role,
          contactId: view.personal?.contact.id ?? "",
          accountId: view.personal?.receivingAccount?.id ?? "",
        }}
      />
    </>
  );
}
