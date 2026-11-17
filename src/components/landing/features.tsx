import {
  Bell,
  CalendarClock,
  CircleX,
  Clock3,
  FileText,
  FolderLock,
  GitCompareArrows,
  HandCoins,
  History,
  Landmark,
  ListChecks,
  Lock,
  MessagesSquare,
  Paperclip,
  PencilLine,
  ScanSearch,
  Scale,
  Stamp,
  StickyNote,
  UserCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { SymmetryMark, type MarkState } from "@/components/brand/symmetry-mark";
import { formatMoney, percentOf } from "@/domain/money";
import { intlLocales, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { CheckLine, Chip, ExampleCaption, FeatureItem, Section, SectionHeading } from "./section";

const CURRENCY = "MXN";

function useMoney() {
  const intlLocale = intlLocales[useLocale() as Locale] ?? intlLocales.es;
  return (minor: bigint) => formatMoney(minor, CURRENCY, intlLocale);
}

/** Text on one side, illustration on the other; stacked on small screens (text first). */
function Split({ reverse = false, children }: { reverse?: boolean; children: [React.ReactNode, React.ReactNode] }) {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
      <div className={cn(reverse && "lg:order-2")}>{children[0]}</div>
      <div className={cn(reverse && "lg:order-1")}>{children[1]}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 03 — Personal tracking
// ─────────────────────────────────────────────────────────────────────────────

export function PersonalTracking() {
  const t = useTranslations("landing.personal");
  const money = useMoney();
  const total = 120_000n;
  const paid = 35_000n;

  return (
    <Section id="personal">
      <Split>
        <div>
          <SectionHeading id="personal" index="03" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
          <ul className="mt-9 space-y-6">
            <FeatureItem icon={Scale} title={t("p1.title")} text={t("p1.text")} />
            <FeatureItem icon={HandCoins} title={t("p2.title")} text={t("p2.text")} />
            <FeatureItem icon={StickyNote} title={t("p3.title")} text={t("p3.text")} />
            <FeatureItem icon={PencilLine} title={t("p4.title")} text={t("p4.text")} />
          </ul>
          <p className="mt-8 flex gap-3 rounded-2xl bg-personal-soft px-4 py-3.5 text-[0.95rem] leading-relaxed">
            <SymmetryMark state="one" className="mt-1 size-5 text-personal" />
            {t("note")}
          </p>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div role="img" aria-label={t("card.label")} className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-32px] shadow-personal/60 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-personal uppercase">
                <SymmetryMark state="one" className="size-4" />
                {t("card.tag")}
              </span>
              <Lock className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-4 font-display text-2xl leading-tight font-medium">{t("card.concept")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("card.who")}</p>

            <div className="mt-6 flex items-end justify-between gap-4">
              <span className="text-sm text-muted-foreground">{t("card.balance")}</span>
              <span className="tabular font-display text-3xl leading-none font-medium text-owe">{money(total - paid)}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-personal" style={{ width: `${percentOf(paid, total)}%` }} />
            </div>

            <ul className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2.5">
                  <SymmetryMark state="one" className="size-4 text-personal" />
                  {t("card.payment")}
                </span>
                <span className="tabular font-medium">−{money(paid)}</span>
              </li>
              <li className="flex items-center gap-2.5 text-muted-foreground">
                <Bell className="size-4 shrink-0" />
                {t("card.reminder")}
              </li>
              <li className="flex items-center gap-2.5 text-muted-foreground">
                <UserRound className="size-4 shrink-0" />
                {t("card.private")}
              </li>
            </ul>
          </div>
          <ExampleCaption />
        </div>
      </Split>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 04 — Shared agreements
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: ReadonlyArray<{ key: "s1" | "s2" | "s3"; mark: MarkState; color: string }> = [
  { key: "s1", mark: "none", color: "text-muted-foreground" },
  { key: "s2", mark: "waiting", color: "text-waiting" },
  { key: "s3", mark: "both", color: "text-agreed" },
];

export function SharedAgreements() {
  const t = useTranslations("landing.shared");

  return (
    <Section id="shared" tone="band">
      <SectionHeading id="shared" index="04" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />

      <ol aria-label={t("stepsLabel")} className="mt-12 grid gap-5 lg:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.key} className="relative rounded-3xl border border-border bg-background p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
                {t("step", { number: index + 1 })}
              </span>
              <SymmetryMark state={step.mark} className={cn("size-10", step.color)} />
            </div>
            <h3 className="mt-5 font-display text-2xl leading-tight font-medium">{t(`${step.key}.title`)}</h3>
            <p className="mt-3 leading-relaxed text-muted-foreground">{t(`${step.key}.text`)}</p>
          </li>
        ))}
      </ol>

      <ul className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        <Note icon={GitCompareArrows}>{t("n1")}</Note>
        <Note icon={UserCheck}>{t("n2")}</Note>
        <Note icon={ListChecks}>{t("n3")}</Note>
        <Note icon={MessagesSquare}>{t("n4")}</Note>
      </ul>
    </Section>
  );
}

function Note({ icon: Icon, children }: { icon: typeof GitCompareArrows; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5 text-[0.95rem] leading-relaxed">
      <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 05 — Payments
// ─────────────────────────────────────────────────────────────────────────────

const METHODS = ["cash", "transfer", "deposit", "card", "other"] as const;

export function Payments() {
  const t = useTranslations("landing.payments");

  return (
    <Section id="payments">
      <Split reverse>
        <div>
          <SectionHeading id="payments" index="05" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
          <ul aria-label={t("methodsLabel")} className="mt-7 flex flex-wrap gap-2">
            {METHODS.map((method) => (
              <li key={method} className="rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium">
                {t(`methods.${method}`)}
              </li>
            ))}
          </ul>
          <ul className="mt-9 space-y-6">
            <FeatureItem icon={CalendarClock} title={t("p1.title")} text={t("p1.text")} />
            <FeatureItem icon={Wallet} title={t("p2.title")} text={t("p2.text")} />
            <FeatureItem icon={History} title={t("p3.title")} text={t("p3.text")} />
            <FeatureItem icon={Landmark} title={t("p4.title")} text={t("p4.text")} />
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl border border-border bg-card p-6 sm:p-8">
            <h3 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t("track.title")}</h3>
            <ol className="mt-6">
              <TrackStep mark="waiting" color="text-waiting" title={t("track.s1.title")} text={t("track.s1.text")} />
              <TrackStep icon={Clock3} color="text-waiting" title={t("track.s2.title")} text={t("track.s2.text")} />
              <TrackStep mark="both" color="text-agreed" title={t("track.s3.title")} text={t("track.s3.text")} last />
            </ol>
            <p className="mt-6 flex items-start gap-3 rounded-xl bg-agreed-soft px-4 py-3 text-sm leading-relaxed font-medium">
              <SymmetryMark state="both" className="mt-0.5 size-4 text-agreed" />
              {t("track.result")}
            </p>
            <p className="mt-2 flex items-start gap-3 rounded-xl bg-muted px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t("track.alt")}
            </p>
          </div>
        </div>
      </Split>
    </Section>
  );
}

function TrackStep({
  mark,
  icon: Icon,
  color,
  title,
  text,
  last = false,
}: {
  mark?: MarkState;
  icon?: typeof Clock3;
  color: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last && <span aria-hidden className="absolute top-11 bottom-1 left-5 w-px -translate-x-1/2 bg-border" />}
      <span className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-background">
        {mark ? <SymmetryMark state={mark} className={cn("size-5", color)} /> : Icon ? <Icon className={cn("size-5", color)} aria-hidden /> : null}
      </span>
      <div className="pt-1.5">
        <p className="leading-snug font-medium">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 06 — Instalments
// ─────────────────────────────────────────────────────────────────────────────

export function Installments() {
  const t = useTranslations("landing.installments");
  const money = useMoney();

  const each = 150_000n;
  const rows = [
    { number: 1, date: t("card.d1"), paid: each, state: "paid" },
    { number: 2, date: t("card.d2"), paid: 60_000n, state: "overdue" },
    { number: 3, date: t("card.d3"), paid: 0n, state: "upcoming" },
    { number: 4, date: t("card.d4"), paid: 0n, state: "upcoming" },
  ] as const;
  const total = each * BigInt(rows.length);
  const paid = rows.reduce((sum, row) => sum + row.paid, 0n);

  return (
    <Section id="installments" tone="band">
      <Split>
        <div>
          <SectionHeading id="installments" index="06" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
          <ul className="mt-9 space-y-3.5">
            <CheckLine>{t("p1")}</CheckLine>
            <CheckLine>{t("p2")}</CheckLine>
            <CheckLine>{t("p3")}</CheckLine>
            <CheckLine>{t("p4")}</CheckLine>
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div role="img" aria-label={t("card.label")} className="rounded-3xl border border-border bg-background p-6 sm:p-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="font-display text-2xl leading-tight font-medium">{t("card.title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("card.kind")}</p>
              </div>
              <p className="tabular text-right text-sm font-medium">{t("card.progress", { paid: money(paid), total: money(total) })}</p>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percentOf(paid, total)}%` }} />
            </div>

            <ul className="mt-6 space-y-4">
              {rows.map((row) => (
                <li key={row.number}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {t("card.installment", { number: row.number })}
                      <span className="ml-2 font-normal text-muted-foreground">{row.date}</span>
                    </span>
                    <Chip tone={row.state === "paid" ? "agreed" : row.state === "overdue" ? "owe" : "neutral"}>
                      {t(`card.state.${row.state}`)}
                    </Chip>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", row.state === "overdue" ? "bg-owe" : "bg-primary")}
                        style={{ width: `${percentOf(row.paid, each)}%` }}
                      />
                    </div>
                    <span className="tabular w-32 shrink-0 text-right text-xs text-muted-foreground">
                      {row.paid === each ? money(each) : t("card.remaining", { amount: money(each - row.paid) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <ExampleCaption />
        </div>
      </Split>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 07 — Receipts
// ─────────────────────────────────────────────────────────────────────────────

export function Receipts() {
  const t = useTranslations("landing.receipts");
  const money = useMoney();

  return (
    <Section id="receipts">
      <Split reverse>
        <div>
          <SectionHeading id="receipts" index="07" eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
          <ul className="mt-9 space-y-6">
            <FeatureItem icon={ScanSearch} title={t("p1.title")} text={t("p1.text")} />
            <FeatureItem icon={FolderLock} title={t("p2.title")} text={t("p2.text")} />
            <FeatureItem icon={Stamp} title={t("p3.title")} text={t("p3.text")} />
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div role="img" aria-label={t("card.label")} className="rounded-3xl border border-border bg-card p-6 shadow-[0_24px_60px_-34px] shadow-waiting/60 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2.5 font-medium">
                <SymmetryMark state="waiting" className="size-5 text-waiting" />
                {t("card.payment")}
              </span>
              <span className="tabular font-display text-2xl leading-none font-medium">{money(250_000n)}</span>
            </div>
            <div className="mt-3">
              <Chip tone="waiting">{t("card.status")}</Chip>
            </div>

            <div className="mt-6 flex items-center gap-4 rounded-2xl border border-dashed border-border bg-background p-4">
              <span className="relative grid h-14 w-11 shrink-0 place-items-center rounded-md border border-border bg-card">
                <FileText className="size-5 text-primary" />
                <Paperclip className="absolute -top-2 -right-2 size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{t("card.file")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("card.attached")}</p>
              </div>
            </div>

            <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{t("card.note")}</p>
          </div>
          <ExampleCaption />
        </div>
      </Split>
    </Section>
  );
}
