"use client";

import { useTranslations } from "next-intl";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import type { ActionFailure, ActionResult } from "@/lib/action-result";
import { isValidationKey } from "@/schemas/common";

interface RunHandlers<T> {
  onSuccess?: (data: T) => void;
  /** Return true when the failure was shown some other way (e.g. next to a field). */
  onError?: (failure: ActionFailure) => boolean | void;
  successMessage?: string;
}

/**
 * Runs a server action from a client component: tracks the pending state, shows expected
 * failures in the reader's language and never lets a network error go unnoticed.
 */
export function useAction() {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  const explain = useCallback(
    (failure: ActionFailure): string => t(`errors.${failure.code}`, { seconds: 60, max: 10, count: 1, ...failure.params }),
    [t],
  );

  /** Message for a field-level problem reported by the server. */
  const fieldMessage = useCallback(
    (key: string | undefined): string | undefined => {
      if (!key) return undefined;
      return isValidationKey(key) ? t(`validation.${key}`) : t("validation.invalid");
    },
    [t],
  );

  const run = useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, handlers: RunHandlers<T> = {}) => {
      startTransition(async () => {
        let result: ActionResult<T>;
        try {
          result = await action();
        } catch {
          toast.error(t("errors.network"));
          return;
        }
        if (result.ok) {
          if (handlers.successMessage) toast.success(handlers.successMessage);
          handlers.onSuccess?.(result.data);
          return;
        }
        const handled = handlers.onError?.(result);
        if (!handled) toast.error(explain(result));
      });
    },
    [explain, t],
  );

  return { run, pending, explain, fieldMessage };
}
