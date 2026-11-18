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
        "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className={cn("size-[1.1rem] shrink-0", active && "text-primary")} aria-hidden />
      <span className="truncate">{children}</span>
      {badge ? (
        <span className="ml-auto rounded-full bg-owe px-1.5 py-0.5 text-[0.65rem] leading-none font-bold text-white tabular">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </Link>
  );
}

/** A tab of the top bar (large screens). */
function TopLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
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
          className="flex items-center gap-2 rounded-full p-0.5 text-left outline-none hover:ring-4 hover:ring-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar className="size-9 ring-2 ring-card">
            {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">
            {user.name} · {user.email}
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
 * Frame of the signed-in app, laid out like a banking app: a top bar with the main places as
 * tabs on large screens; on phones a slim top bar plus a floating bottom bar with the four
 * places people go most and "new debt" in the middle.
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
      aria-current={isActive("/app/notifications", false) ? "page" : undefined}
      className="relative grid size-10 place-items-center rounded-full bg-card text-foreground shadow-[var(--shadow-card)] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Bell className="size-[1.1rem]" aria-hidden />
      {unread > 0 && (
        <span className="tabular absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-owe px-1 text-[0.65rem] leading-5 font-bold text-white ring-2 ring-background" aria-hidden>
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/app" className="shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo />
          </Link>
          <nav aria-label={t("nav.primary")} className="ml-4 hidden items-center gap-1 lg:flex">
            {PRIMARY.map((item) => (
              <TopLink key={item.href} href={item.href} active={isActive(item.href, item.exact)}>
                {t(`nav.${item.key}`)}
              </TopLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <Button asChild size="sm" className="hidden lg:inline-flex">
              <Link href="/app/debts/new">
                <Plus aria-hidden />
                {t("shell.newDebt")}
              </Link>
            </Button>
            {bell}
            <UserMenu user={user} repoUrl={repoUrl} />
          </div>
        </div>
      </header>

      <main id="content" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-32 sm:px-6 lg:px-8 lg:pt-10 lg:pb-16">
        {children}
        <footer className="mt-20 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <span>{t("shell.footerNote")}</span>
          <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="rounded underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {t("footer.source")}
          </a>
          <Link href="/app/settings" className="rounded underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {t("nav.settings")}
          </Link>
          <SupportTrigger />
        </footer>
      </main>

      {/* Bottom bar (phones and tablets) */}
      <nav aria-label={t("nav.primary")} className="pb-safe fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden">
        <ul className="mx-auto mb-1 grid max-w-md grid-cols-5 items-center rounded-[1.75rem] border border-border/70 bg-card/90 px-1.5 py-1.5 shadow-[var(--shadow-raised)] backdrop-blur-xl">
          {[PRIMARY[0], PRIMARY[1]].map((item) => (
            <li key={item.href}>
              <BottomLink href={item.href} icon={item.icon} active={isActive(item.href, item.exact)} label={t(`nav.${item.key}`)} />
            </li>
          ))}
          <li className="flex justify-center">
            <Link
              href="/app/debts/new"
              aria-label={t("shell.newDebt")}
              className="grid size-[3.25rem] place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_-6px_var(--primary)] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="size-6" aria-hidden />
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
              className="flex w-full flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[0.68rem] font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Menu className="size-5" aria-hidden />
              {t("nav.menu")}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
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
        "flex flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-[0.68rem] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" aria-hidden />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
