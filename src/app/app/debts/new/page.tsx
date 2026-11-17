import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DebtWizard } from "@/components/debts/debt-wizard";
import { todayInTimeZone } from "@/domain/dates";
import { env } from "@/server/env";
import { listBankAccounts, maskedLabel } from "@/server/services/bank-accounts";
import { listContactOptions } from "@/server/services/contacts";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("wizard"))("metaTitle") };
}

export default async function NewDebtPage({ searchParams }: { searchParams: Promise<{ person?: string; mode?: string }> }) {
  const [actor, params] = await Promise.all([requireActor(), searchParams]);
  const [contacts, accounts] = await Promise.all([listContactOptions(actor), listBankAccounts(actor)]);

  return (
    <DebtWizard
      contacts={contacts.map((contact) => ({ id: contact.id, name: contact.name, email: contact.email, linked: contact.linkedUserId !== null }))}
      accounts={accounts.map((account) => ({ id: account.id, alias: account.alias, label: maskedLabel(account) }))}
      defaultCurrency={actor.defaultCurrency}
      today={todayInTimeZone(actor.timeZone)}
      maxUploadMb={env().MAX_UPLOAD_MB}
      initialContactId={params.person}
      initialMode={params.mode === "personal" ? "PERSONAL" : params.mode === "shared" ? "SHARED" : undefined}
    />
  );
}
