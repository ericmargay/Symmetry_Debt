import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ConversionForm } from "@/components/debts/conversion-form";
import { PageHeader } from "@/components/shared/page-header";
import { isAppError } from "@/server/errors";
import { listBankAccounts, maskedLabel } from "@/server/services/bank-accounts";
import { getDebtView } from "@/server/services/views";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("convert"))("metaTitle") };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, actor, t] = await Promise.all([params, requireActor(), getTranslations("convert")]);
  const view = await getDebtView(actor, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  if (!view.can.convert || !view.personal) redirect(`/app/debts/${view.id}`);

  const accounts = view.role === "CREDITOR" ? await listBankAccounts(actor) : [];

  return (
    <>
      <PageHeader
        back={{ href: `/app/debts/${view.id}`, label: view.terms.concept }}
        title={t("title")}
        description={t("intro", { name: view.counterparty.name })}
        className="mx-auto max-w-2xl"
      />
      <ConversionForm
        debtId={view.id}
        counterpartyName={view.counterparty.name}
        currency={view.terms.currency}
        totalOwedMinor={view.balance.totalOwedMinor}
        outstandingMinor={view.balance.outstandingMinor}
        payments={view.movements
          .filter((movement) => movement.kind === "PAYMENT" && movement.status === "PERSONAL_RECORD")
          .map((movement) => ({
            id: movement.id,
            amountMinor: movement.amountMinor,
            effectiveDate: movement.effectiveDate,
            method: movement.method,
            receipts: movement.attachments.length,
          }))
          .reverse()}
        debtReceipts={view.attachments.length}
        hasNotes={Boolean(view.personal.privateNotes)}
        suggestedEmail={view.personal.contact.email}
        canShareAccount={view.role === "CREDITOR"}
        accounts={accounts.map((account) => ({ id: account.id, alias: account.alias, label: maskedLabel(account) }))}
      />
    </>
  );
}
