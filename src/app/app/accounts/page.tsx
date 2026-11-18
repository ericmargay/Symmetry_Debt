import { Landmark, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountCard } from "@/components/accounts/account-card";
import { AccountFormButton } from "@/components/accounts/account-form";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { listBankAccounts } from "@/server/services/bank-accounts";
import { requireActor } from "@/server/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("accounts"))("metaTitle") };
}

export default async function AccountsPage() {
  const [actor, t] = await Promise.all([requireActor(), getTranslations("accounts")]);
  const accounts = await listBankAccounts(actor);
  const holder = actor.name ?? "";
  const addButton = <AccountFormButton defaultCurrency={actor.defaultCurrency} defaultHolder={holder} />;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={addButton} />

      {accounts.length === 0 ? (
        <EmptyState icon={<Landmark />} title={t("empty.title")} text={t("empty.text")} action={addButton} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} defaultCurrency={actor.defaultCurrency} defaultHolder={holder} />
          ))}
        </div>
      )}

      <p className="surface mt-6 flex gap-3 px-4 py-3.5 text-sm leading-relaxed text-muted-foreground">
        <span className="grid size-9 shrink-0 place-items-center rounded-2xl bg-secondary text-primary" aria-hidden>
          <ShieldCheck className="size-4" />
        </span>
        {t("security")}
      </p>
    </>
  );
}
