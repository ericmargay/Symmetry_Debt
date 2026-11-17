"use client";

import { Loader2, LocateFixed } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { updatePreferencesAction } from "@/actions/settings";
import { FormField } from "@/components/shared/form-field";
import { NativeSelect } from "@/components/shared/native-select";
import { useAction } from "@/components/shared/use-action";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CURRENCY_CODES } from "@/domain/currencies";
import { localeNames, locales } from "@/i18n/config";
import type { PreferencesInput } from "@/schemas/settings";

const COMMON_TIME_ZONES = [
  "America/Mexico_City",
  "America/Tijuana",
  "America/Hermosillo",
  "America/Chihuahua",
  "America/Monterrey",
  "America/Cancun",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Guatemala",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/London",
  "UTC",
];

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2.5">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5 shrink-0" />
    </label>
  );
}

export function PreferencesForm({ initial, emailEnabled }: { initial: PreferencesInput; emailEnabled: boolean }) {
  const t = useTranslations("pages.settings");
  const router = useRouter();
  const { run, pending } = useAction();
  const [values, setValues] = useState(initial);
  const set = <K extends keyof PreferencesInput>(key: K, value: PreferencesInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const zones = COMMON_TIME_ZONES.includes(values.timeZone) ? COMMON_TIME_ZONES : [values.timeZone, ...COMMON_TIME_ZONES];

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => updatePreferencesAction(values), { successMessage: t("saved"), onSuccess: () => router.refresh() });
      }}
    >
      <section aria-labelledby="region-title" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 id="region-title" className="mb-4 text-base font-semibold">
          {t("region.title")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t("region.language")} hint={t("region.languageHint")}>
            {(field) => (
              <NativeSelect {...field} value={values.locale} onChange={(event) => set("locale", event.target.value as PreferencesInput["locale"])}>
                {locales.map((locale) => (
                  <option key={locale} value={locale}>
                    {localeNames[locale]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={t("region.currency")} hint={t("region.currencyHint")}>
            {(field) => (
              <NativeSelect {...field} value={values.defaultCurrency} onChange={(event) => set("defaultCurrency", event.target.value)}>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label={t("region.timeZone")} hint={t("region.timeZoneHint")} className="sm:col-span-2">
            {(field) => (
              <div className="flex flex-wrap gap-2">
                <div className="min-w-56 flex-1">
                  <NativeSelect {...field} value={values.timeZone} onChange={(event) => set("timeZone", event.target.value)}>
                    {zones.map((zone) => (
                      <option key={zone} value={zone}>
                        {zone.replace(/_/g, " ")}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <Button type="button" variant="outline" onClick={() => set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone)}>
                  <LocateFixed aria-hidden />
                  {t("region.detect")}
                </Button>
              </div>
            )}
          </FormField>
        </div>
      </section>

      <section id="notifications" aria-labelledby="notifications-title" className="scroll-mt-20 rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 id="notifications-title" className="text-base font-semibold">
          {t("notifications.title")}
        </h2>
        <p className="mt-1 mb-2 text-sm text-muted-foreground">{t("notifications.inApp")}</p>
        <div className="divide-y divide-border">
          <Toggle label={t("notifications.reminders")} hint={t("notifications.remindersHint")} checked={values.remindersEnabled} onChange={(value) => set("remindersEnabled", value)} />
        </div>
        <h3 className="mt-5 text-sm font-semibold">{t("notifications.emailTitle")}</h3>
        {!emailEnabled && <p className="mt-1 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{t("notifications.emailDisabled")}</p>}
        <div className="divide-y divide-border">
          <Toggle
            label={t("notifications.emailActionRequired")}
            hint={t("notifications.emailActionRequiredHint")}
            checked={values.emailActionRequired}
            onChange={(value) => set("emailActionRequired", value)}
            disabled={!emailEnabled}
          />
          <Toggle label={t("notifications.emailActivity")} hint={t("notifications.emailActivityHint")} checked={values.emailActivity} onChange={(value) => set("emailActivity", value)} disabled={!emailEnabled} />
          <Toggle label={t("notifications.emailReminders")} checked={values.emailReminders} onChange={(value) => set("emailReminders", value)} disabled={!emailEnabled || !values.remindersEnabled} />
        </div>
      </section>

      <div>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
