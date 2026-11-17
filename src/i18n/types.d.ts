import type es from "../../messages/es.json";
import type { Locale } from "./config";

// Makes message keys type-checked: t("some.key") fails to compile if the key does not exist
// in messages/es.json (the reference catalogue).
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof es;
  }
}
