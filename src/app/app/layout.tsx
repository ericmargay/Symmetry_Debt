import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { SupportProvider } from "@/components/shared/support";
import { donationLinks, repoUrl } from "@/lib/site";
import { unreadNotificationCount } from "@/server/services/inbox";
import { requireActor } from "@/server/session";

export const metadata: Metadata = {
  // Nothing behind the sign-in belongs in a search engine.
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const unread = await unreadNotificationCount(actor);

  return (
    <SupportProvider links={donationLinks()}>
      <AppShell
        user={{ name: actor.name?.trim() || actor.email.split("@")[0], email: actor.email, image: actor.image }}
        unread={unread}
        repoUrl={repoUrl()}
      >
        {children}
      </AppShell>
    </SupportProvider>
  );
}
