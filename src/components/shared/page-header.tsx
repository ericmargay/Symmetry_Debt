import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        )}
        <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight break-words sm:text-[1.75rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, description, action, children, className }: { title?: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 sm:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base leading-snug font-semibold">{title}</h2>}
            {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, text, action, footnote, className }: { icon?: React.ReactNode; title: string; text?: React.ReactNode; action?: React.ReactNode; footnote?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-border px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-full bg-secondary text-secondary-foreground [&_svg]:size-5">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {text && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
      {footnote && <div className="mt-8 max-w-sm text-xs leading-relaxed text-muted-foreground">{footnote}</div>}
    </div>
  );
}
