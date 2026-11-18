"use client";

import { createContext, useContext, useState } from "react";
import { MovementDialog, type InstallmentToMark, type MovementFormContext } from "@/components/debts/detail/movement-form";

/**
 * One payment dialog for the whole debt page: the quick action on the account card and the
 * check of every instalment open the same form, either for a given instalment (prefilled) or
 * for a free amount.
 */
const LauncherContext = createContext<{ markInstallment: (installment: InstallmentToMark) => void; recordPayment: () => void } | null>(null);

export function PaymentLauncher({ context, next, children }: { context: MovementFormContext; next: InstallmentToMark | null; children: React.ReactNode }) {
  const [state, setState] = useState<{ installment: InstallmentToMark | null } | null>(null);

  return (
    <LauncherContext.Provider
      value={{
        markInstallment: (installment) => setState({ installment }),
        recordPayment: () => setState({ installment: next }),
      }}
    >
      {children}
      <MovementDialog
        key={state ? `pay-${state.installment?.sequence ?? "free"}` : "closed"}
        open={state !== null}
        onOpenChange={(open) => !open && setState(null)}
        context={context}
        kind="PAYMENT"
        installment={state?.installment ?? null}
      />
    </LauncherContext.Provider>
  );
}

export function usePaymentLauncher() {
  return useContext(LauncherContext);
}

/** A button anywhere on the page that opens the payment dialog for the next open instalment. */
export function MarkPaymentButton({ className, children }: { className?: string; children: React.ReactNode }) {
  const launcher = usePaymentLauncher();
  if (!launcher) return null;
  return (
    <button type="button" onClick={launcher.recordPayment} className={className}>
      {children}
    </button>
  );
}
