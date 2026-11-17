import { useTranslations } from "next-intl";
import type { MovementStatus } from "@/domain/balance";
import type { DebtStatus } from "@/domain/lifecycle";
import { cn } from "@/lib/utils";

const DEBT_STYLES: Record<DebtStatus, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  PENDING_APPROVAL: "bg-waiting-soft text-waiting",
  CHANGES_REQUESTED: "bg-waiting-soft text-waiting",
  ACTIVE: "bg-secondary text-secondary-foreground",
  DISPUTED: "bg-destructive/10 text-destructive",
  SETTLED: "bg-owed-soft text-owed",
  CANCELLED: "bg-muted text-muted-foreground",
  CONVERTED: "bg-muted text-muted-foreground",
};

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function DebtStatusBadge({ status, className }: { status: DebtStatus; className?: string }) {
  const t = useTranslations("labels.status");
  return <span className={cn(pill, DEBT_STYLES[status], className)}>{t(status)}</span>;
}

const MOVEMENT_STYLES: Record<MovementStatus, string> = {
  PERSONAL_RECORD: "bg-personal-soft text-personal",
  PENDING: "bg-waiting-soft text-waiting",
  CLARIFICATION: "bg-waiting-soft text-waiting",
  CONFIRMED: "bg-agreed-soft text-agreed",
  REJECTED: "bg-destructive/10 text-destructive",
  WITHDRAWN: "bg-muted text-muted-foreground",
};

export function MovementStatusBadge({ status, className }: { status: MovementStatus; className?: string }) {
  const t = useTranslations("labels.movementStatus");
  return <span className={cn(pill, MOVEMENT_STYLES[status], className)}>{t(status)}</span>;
}
