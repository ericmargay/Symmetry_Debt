import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { DebtFilter } from "@/server/services/views";

/** The same five views everywhere: all, personal, shared, pending confirmation, settled (+ archive). */
export function FilterTabs({
  basePath,
  current,
  counts,
  filters = ["all", "personal", "shared", "pending", "settled"],
}: {
  basePath: string;
  current: DebtFilter;
  counts: Record<DebtFilter, number>;
  filters?: DebtFilter[];
}) {
  const t = useTranslations("dashboard");
  return (
    <nav aria-label={t("filtersLabel")} className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {filters.map((filter) => {
          const active = filter === current;
          return (
            <li key={filter}>
              <Link
                href={filter === "all" ? basePath : `${basePath}?filter=${filter}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`filter.${filter}`)}
                <span className={cn("tabular rounded-full px-1.5 text-xs", active ? "bg-primary-foreground/20" : "bg-muted")}>{counts[filter]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
