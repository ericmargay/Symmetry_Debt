"use client";

import { Bell, HandCoins, History, Landmark, LayoutDashboard, LogOut, Menu, Plus, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { signOutAction } from "@/actions/auth";
import { GithubIcon } from "@/components/brand/github-icon";
import { Logo } from "@/components/brand/logo";
import { LanguageSwitch } from "@/components/shared/language-switch";
import { SupportTrigger } from "@/components/shared/support";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
}

const PRIMARY = [
  { href: "/app", key: "dashboard", icon: LayoutDashboard, exact: true },
  { href: "/app/debts", key: "debts", icon: HandCoins, exact: false },
  { href: "/app/people", key: "people", icon: Users, exact: false },
  { href: "/app/accounts", key: "accounts", icon: Landmark, exact: false },
  { href: "/app/activity", key: "activity", icon: History, exact: false },
] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase() || "·";
}

function useIsActive() {
  const pathname = usePathname();
  return (href: string, exact: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
}

function NavLink({ href, active, icon: Icon, children, onNavigate, badge }: { href: string; active: boolean; icon: typeof Bell; children: React.ReactNode; onNavigate?: () => void; badge?: number }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-primary")} aria-hidden />
      <span className="truncate">{children}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[0.65rem] leading-none font-semibold text-primary-foreground tabular">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function UserMenu({ user, repoUrl, align = "end" }: { user: ShellUser; repoUrl: string; align?: "start" | "end" }) {
  const t = useTranslations();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("shell.userMenu")}
          className="flex w-full items-center gap-3 rounded-lg p-1.5 text-left outline-none hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-8">
            {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">{t("locale.label")}</span>
          <LanguageSwitch variant="menu" />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-muted-foreground">{t("theme.label")}</span>
          <ThemeToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings">
            <Settings aria-hidden />
            {t("nav.settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={repoUrl} target="_blank" rel="noopener noreferrer">
            <GithubIcon />
            {t("nav.github")}
          </a>
        </DropdownMenuItem>
        <div className="px-2 py-1.5 empty:hidden">
          <SupportTrigger />
        </div>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              {t("nav.signOut")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Frame of the signed-in app: a sidebar on large screens; on phones a slim top bar plus a
 * bottom bar with the four places people go most and "new debt" in the middle.
 */
export function AppShell({ user, unread, repoUrl, children }: { user: ShellUser; unread: number; repoUrl: string; children: React.ReactNode }) {
  const t = useTranslations();
  const isActive = useIsActive();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  const bell = (
    <Link
      href="/app/notifications"
      aria-label={unread > 0 ? t("nav.notificationsUnread", { count: unread }) : t("nav.notifications")}
      className="relative grid size-10 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="size-[1.15rem]" aria-hidden />
      {unread > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-owe ring-2 ring-background" aria-hidden />}
    </Link>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Sidebar (large screens) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/app" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
        </div>
        <div className="px-3 pb-3">
          <Button asChild className="w-full justify-center">
            <Link href="/app/debts/new">
              <Plus aria-hidden />
              {t("shell.newDebt")}
            </Link>
          </Button>
        </div>
        <nav aria-label={t("nav.primary")} className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3">
          {PRIMARY.map((item) => (
            <NavLink key={item.href} href={item.href} icon={item.icon} active={isActive(item.href, item.exact)}>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
          <NavLink href="/app/notifications" icon={Bell} active={isActive("/app/notifications", false)} badge={unread}>
            {t("nav.notifications")}
          </NavLink>
          <NavLink href="/app/settings" icon={Settings} active={isActive("/app/settings", false)}>
            {t("nav.settings")}
          </NavLink>
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <SupportTrigger className="mb-2 min-h-9 w-full px-3" />
          <UserMenu user={user} repoUrl={repoUrl} align="start" />
        </div>
      </aside>

      {/* Top bar (phones and tablets) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/90 px-3 backdrop-blur lg:hidden">
        <Link href="/app" className="rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          {bell}
          <div className="w-11">
            <UserMenu user={user} repoUrl={repoUrl} />
          </div>
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-16">
        {children}
        <footer className="mt-16 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>{t("shell.footerNote")}</span>
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="rounded underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {t("footer.source")}
          </a>
          <SupportTrigger>{t("footer.support")}</SupportTrigger>
        </footer>
      </main>

      {/* Bottom bar (phones and tablets) */}
      <nav aria-label={t("nav.primary")} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur lg:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-1 pt-1">
          {[PRIMARY[0], PRIMARY[1]].map((item) => (
            <li key={item.href}>
              <BottomLink href={item.href} icon={item.icon} active={isActive(item.href, item.exact)} label={t(`nav.${item.key}`)} />
            </li>
          ))}
          <li className="flex justify-center">
            <Link
              href="/app/debts/new"
              aria-label={t("shell.newDebt")}
              className="-mt-4 grid size-12 place-items-center rounded-full bg-primary text-primary-foreground shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-5" aria-hidden />
            </Link>
          </li>
          <li>
            <BottomLink href={PRIMARY[2].href} icon={PRIMARY[2].icon} active={isActive(PRIMARY[2].href, false)} label={t("nav.people")} />
          </li>
          <li>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-haspopup="dialog"
              className="flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[0.68rem] font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="size-5" aria-hidden />
              {t("nav.menu")}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
          <SheetHeader>
            <SheetTitle>{t("nav.menu")}</SheetTitle>
            <SheetDescription className="truncate">{t("shell.signedInAs", { email: user.email })}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-0.5 px-3 pb-4">
            {PRIMARY.slice(3).map((item) => (
              <NavLink key={item.href} href={item.href} icon={item.icon} active={isActive(item.href, item.exact)} onNavigate={closeMenu}>
                {t(`nav.${item.key}`)}
              </NavLink>
            ))}
            <NavLink href="/app/notifications" icon={Bell} active={isActive("/app/notifications", false)} badge={unread} onNavigate={closeMenu}>
              {t("nav.notifications")}
            </NavLink>
            <NavLink href="/app/settings" icon={Settings} active={isActive("/app/settings", false)} onNavigate={closeMenu}>
              {t("nav.settings")}
            </NavLink>
            <div className="mt-2 border-t border-border pt-3">
              <SupportTrigger className="min-h-10 px-3 text-sm" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function BottomLink({ href, icon: Icon, active, label }: { href: string; icon: typeof Bell; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[0.68rem] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
