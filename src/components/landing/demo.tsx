"use client";

import { CircleX, Info, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { SymmetryMark } from "@/components/brand/symmetry-mark";
import { Button } from "@/components/ui/button";
import { formatMoney, percentOf } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { Chip } from "./section";

/**
 * Interactive demo for the landing page.
 *
 * Everything lives in this component's memory: no request is made and nothing is stored. It
 * follows the same rules as the real thing, so what a visitor learns here holds in the app:
 *
 *   Personal record   → a payment changes the recorded balance at once; its owner can delete it.
 *   Shared agreement  → a payment is "to be confirmed" until the OTHER side confirms it, and
 *                       only then does the confirmed balance move. Whoever recorded it cannot
 *                       confirm it. Pending payments cannot add up to more than what is owed.
 *
 * Amounts are minor units (bigint), like everywhere else.
 */

const CURRENCY = "MXN";
const TOTAL = 600_000n;
const STEP = 100_000n;

type Mode = "personal" | "shared";
type Person = "ana" | "luis";
type Status = "personal" | "pending" | "confirmed" | "rejected";

interface Movement {
  id: number;
  by: Person;
  status: Status;
}

type PersonalEvent = "start" | "recorded" | "removed";
type SharedEvent = "start" | "confirmed" | "rejected";

const INITIAL_PERSONAL: Movement[] = [{ id: 1, by: "ana", status: "personal" }];
const INITIAL_SHARED: Movement[] = [{ id: 2, by: "luis", status: "confirmed" }];

const other = (person: Person): Person => (person === "ana" ? "luis" : "ana");

function sumOf(movements: readonly Movement[], status: Status): bigint {
  return BigInt(movements.filter((movement) => movement.status === status).length) * STEP;
}

export function Demo() {
  const t = useTranslations("landing.demo");
  const root = useTranslations("landing");
  const intlLocale = intlLocales[useLocale() as Locale] ?? intlLocales.es;
  const money = (minor: bigint) => formatMoney(minor, CURRENCY, intlLocale);
  const amount = money(STEP);

  const nextId = useRef(10);
  const [mode, setMode] = useState<Mode>("personal");
  const [viewer, setViewer] = useState<Person>("luis");
  const [personal, setPersonal] = useState<Movement[]>(INITIAL_PERSONAL);
  const [personalEvent, setPersonalEvent] = useState<PersonalEvent>("start");
  const [shared, setShared] = useState<Movement[]>(INITIAL_SHARED);
  const [sharedEvent, setSharedEvent] = useState<SharedEvent>("start");

  const name = (person: Person) => root(`people.${person}`);

  // ── Personal record ────────────────────────────────────────────────────────
  const personalPaid = sumOf(personal, "personal");
  const personalOutstanding = TOTAL - personalPaid;

  const recordPersonal = () => {
    if (personalOutstanding < STEP) return;
    const id = (nextId.current += 1);
    setPersonal((list) => [{ id, by: "ana", status: "personal" }, ...list]);
    setPersonalEvent("recorded");
  };
  const removePersonal = (id: number) => {
    setPersonal((list) => list.filter((movement) => movement.id !== id));
    setPersonalEvent("removed");
  };

  // ── Shared agreement ───────────────────────────────────────────────────────
  const confirmedPaid = sumOf(shared, "confirmed");
  const awaiting = sumOf(shared, "pending");
  const confirmedOutstanding = TOTAL - confirmedPaid;
  const room = confirmedOutstanding - awaiting;
  const minePending = shared.some((movement) => movement.status === "pending" && movement.by === viewer);
  const theirsPending = shared.some((movement) => movement.status === "pending" && movement.by !== viewer);

  const recordShared = () => {
    if (room < STEP) return;
    const id = (nextId.current += 1);
    setShared((list) => [{ id, by: viewer, status: "pending" }, ...list]);
    setSharedEvent("start");
  };
  const answer = (id: number, status: "confirmed" | "rejected") => {
    setShared((list) =>
      // Only the side that did NOT record a payment can answer it.
      list.map((movement) =>
        movement.id === id && movement.status === "pending" && movement.by !== viewer ? { ...movement, status } : movement,
      ),
    );
    setSharedEvent(status);
  };

  const reset = () => {
    setPersonal(INITIAL_PERSONAL);
    setPersonalEvent("start");
    setShared(INITIAL_SHARED);
    setSharedEvent("start");
    setViewer("luis");
  };

  const coach =
    mode === "personal"
      ? personalOutstanding === 0n
        ? t("personal.coach.settled")
        : t(`personal.coach.${personalEvent}`)
      : confirmedOutstanding === 0n
        ? t("shared.coach.settled")
        : theirsPending
          ? t("shared.coach.theirPending", { name: name(other(viewer)) })
          : minePending
            ? t("shared.coach.ownPending", { name: name(other(viewer)) })
            : t(`shared.coach.${sharedEvent}`);

  const isPersonal = mode === "personal";
  const movements = isPersonal ? personal : shared;
  const outstanding = isPersonal ? personalOutstanding : confirmedOutstanding;
  const paid = isPersonal ? personalPaid : confirmedPaid;
  const canRecord = isPersonal ? personalOutstanding >= STEP : room >= STEP;

  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-background shadow-[0_30px_70px_-40px] shadow-primary/30">
      {/* What this is, and the switch between the two modes */}
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-waiting-soft px-3 py-1.5 text-xs font-semibold tracking-wide">
          <Info className="size-3.5 text-waiting" aria-hidden />
          {root("fictional")}
        </p>
        <div role="group" aria-label={t("mode.label")} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 sm:inline-grid">
          {(["personal", "shared"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => setMode(option)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.8125rem] leading-tight font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 sm:text-sm",
                mode === option
                  ? "bg-card text-foreground shadow-sm dark:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <SymmetryMark
                state={option === "personal" ? "one" : "both"}
                className={cn("size-4", mode === option && (option === "personal" ? "text-personal" : "text-agreed"))}
              />
              {t(`mode.${option}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Balance and actions */}
        <div className="border-border p-5 sm:p-7 lg:border-r">
          <p className="font-display text-2xl leading-tight font-medium">{t("concept")}</p>
          <p className="tabular mt-1 text-sm text-muted-foreground">{t("summary", { total: money(TOTAL) })}</p>
          <p className="mt-4 text-[0.95rem] leading-relaxed text-muted-foreground">
            {isPersonal ? t("personal.intro") : t("shared.intro")}
          </p>

          {!isPersonal && (
            <div className="mt-5">
              <p id="demo-view-as" className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {t("shared.viewAs")}
              </p>
              <div role="group" aria-labelledby="demo-view-as" className="mt-2 grid grid-cols-2 gap-2">
                {(["luis", "ana"] as const).map((person) => (
                  <button
                    key={person}
                    type="button"
                    aria-pressed={viewer === person}
                    onClick={() => setViewer(person)}
                    className={cn(
                      "min-h-11 rounded-xl border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      viewer === person
                        ? "border-primary bg-secondary text-secondary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {person === "luis" ? t("shared.asLuis") : t("shared.asAna")}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className={cn("mt-5 rounded-2xl p-5", isPersonal ? "bg-personal-soft" : "bg-agreed-soft")}>
            <p className={cn("flex items-center gap-2 text-sm font-medium", isPersonal ? "text-personal" : "text-agreed")}>
              <SymmetryMark state={isPersonal ? "one" : "both"} className="size-4" />
              {isPersonal ? t("personal.balanceLabel") : t("shared.balanceLabel")}
            </p>
            <p className="tabular mt-2 font-display text-4xl leading-none font-medium sm:text-[2.75rem]" data-testid="demo-balance">
              {money(outstanding)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{isPersonal ? t("personal.balanceHint") : t("shared.balanceHint")}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/70">
              <div
                className={cn("h-full rounded-full transition-[width] duration-300", isPersonal ? "bg-personal" : "bg-agreed")}
                style={{ width: `${percentOf(paid, TOTAL)}%` }}
              />
            </div>
            <p className="tabular mt-2 text-xs text-muted-foreground">
              {isPersonal ? t("personal.paid", { paid: money(paid) }) : t("shared.paid", { paid: money(paid) })}
            </p>

            {!isPersonal && awaiting > 0n && (
              <div className="mt-4 rounded-xl bg-waiting-soft px-3.5 py-2.5">
                <div className="flex items-center justify-between gap-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <SymmetryMark state="waiting" className="size-4 text-waiting" />
                    {t("shared.awaitingLabel")}
                  </span>
                  <span className="tabular" data-testid="demo-awaiting">
                    {money(awaiting)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("shared.awaitingHint")}</p>
              </div>
            )}
          </div>

          <Button type="button" className="mt-5 w-full" onClick={isPersonal ? recordPersonal : recordShared} disabled={!canRecord}>
            <Plus data-icon="inline-start" aria-hidden />
            {isPersonal
              ? t("personal.record", { amount })
              : viewer === "luis"
                ? t("shared.recordPaid", { amount })
                : t("shared.recordReceived", { amount })}
          </Button>
          {!canRecord && outstanding > 0n && <p className="mt-2 text-xs text-muted-foreground">{t("shared.noRoom")}</p>}

          <p role="status" aria-live="polite" className="mt-4 min-h-[4.5rem] text-sm leading-relaxed text-foreground">
            {coach}
          </p>
        </div>

        {/* Movements */}
        <div className="border-t border-border p-5 sm:p-7 lg:border-t-0">
          <h3 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t("movements")}</h3>
          {movements.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {movements.map((movement) => (
                <li key={movement.id} className="flex animate-in flex-wrap items-center gap-x-3 gap-y-2 py-3.5 duration-300 fade-in slide-in-from-top-1">
                  {movement.status === "rejected" ? (
                    <CircleX className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <SymmetryMark
                      state={movement.status === "personal" ? "one" : movement.status === "pending" ? "waiting" : "both"}
                      className={cn(
                        "size-5",
                        movement.status === "personal" && "text-personal",
                        movement.status === "pending" && "text-waiting",
                        movement.status === "confirmed" && "text-agreed",
                      )}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("tabular font-medium", movement.status === "rejected" && "text-muted-foreground line-through")}>
                      {t("payment", { amount })}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {!isPersonal && <span>{t("recordedBy", { name: name(movement.by) })}</span>}
                      <Chip
                        tone={
                          movement.status === "personal"
                            ? "personal"
                            : movement.status === "pending"
                              ? "waiting"
                              : movement.status === "confirmed"
                                ? "agreed"
                                : "neutral"
                        }
                      >
                        {t(`status.${movement.status}`)}
                      </Chip>
                    </p>
                  </div>

                  {movement.status === "personal" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("personal.remove", { amount })}
                      onClick={() => removePersonal(movement.id)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}

                  {movement.status === "pending" &&
                    (movement.by === viewer ? (
                      <p className="w-full text-xs text-muted-foreground sm:w-auto">
                        {t("shared.waitingFor", { name: name(other(viewer)) })}
                      </p>
                    ) : (
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 sm:flex-none"
                          aria-label={t("shared.confirmLabel", { amount })}
                          onClick={() => answer(movement.id, "confirmed")}
                        >
                          {t("shared.confirm")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none"
                          aria-label={t("shared.rejectLabel", { amount })}
                          onClick={() => answer(movement.id, "rejected")}
                        >
                          {t("shared.reject")}
                        </Button>
                      </div>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
        <Button type="button" variant="ghost" size="sm" onClick={reset} className="w-fit">
          <RotateCcw data-icon="inline-start" aria-hidden />
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
