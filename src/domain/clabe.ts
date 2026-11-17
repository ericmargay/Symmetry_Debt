/**
 * CLABE — the 18-digit standardised bank account number used for transfers in Mexico.
 *
 *   positions  1–3   bank
 *   positions  4–6   branch / plaza
 *   positions  7–17  account
 *   position   18    check digit
 *
 * The check digit is computed over the first 17 digits with the weights 3, 7, 1 repeating:
 * take (digit × weight) mod 10 for each, add them up, and the check digit is
 * (10 − (sum mod 10)) mod 10.
 */

export type ClabeError = "length" | "digits" | "checksum";

export type ClabeValidation =
  | { ok: true; clabe: string; bankCode: string; bankName: string | null }
  | { ok: false; error: ClabeError };

const WEIGHTS = [3, 7, 1] as const;

/** Removes the spaces and dashes people add when they copy a CLABE by hand. */
export function normalizeClabe(input: string): string {
  return input.replace(/[\s\u00A0-]/g, "");
}

export function clabeCheckDigit(first17: string): number {
  if (!/^[0-9]{17}$/.test(first17)) throw new RangeError("expected 17 digits");
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    sum += (Number(first17[i]) * WEIGHTS[i % 3]) % 10;
  }
  return (10 - (sum % 10)) % 10;
}

export function validateClabe(input: string): ClabeValidation {
  const clabe = normalizeClabe(input);
  if (!/^[0-9]*$/.test(clabe)) return { ok: false, error: "digits" };
  if (clabe.length !== 18) return { ok: false, error: "length" };
  if (clabeCheckDigit(clabe.slice(0, 17)) !== Number(clabe[17])) return { ok: false, error: "checksum" };
  const bankCode = clabe.slice(0, 3);
  return { ok: true, clabe, bankCode, bankName: CLABE_BANKS[bankCode] ?? null };
}

/** "012 180 01234567890 7" — easier to read and to compare by eye. */
export function formatClabe(clabe: string): string {
  const digits = normalizeClabe(clabe);
  if (digits.length !== 18) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 17)} ${digits.slice(17)}`;
}

/** "•••• 8907" */
export function maskLast4(last4: string | null | undefined): string {
  return last4 ? `•••• ${last4}` : "••••";
}

/**
 * Bank identified by the first three digits. Only used to suggest the bank's name while typing;
 * the user can always correct it, and an unknown prefix is perfectly valid.
 */
export const CLABE_BANKS: Readonly<Record<string, string>> = {
  "002": "Citibanamex",
  "012": "BBVA México",
  "014": "Santander",
  "021": "HSBC",
  "030": "BanBajío",
  "036": "Inbursa",
  "042": "Mifel",
  "044": "Scotiabank",
  "058": "Banregio",
  "059": "Invex",
  "062": "Afirme",
  "072": "Banorte",
  "112": "Monex",
  "113": "Ve por Más",
  "127": "Banco Azteca",
  "130": "Compartamos Banco",
  "132": "Multiva",
  "133": "Actinver",
  "136": "Intercam Banco",
  "137": "BanCoppel",
  "140": "Consubanco",
  "143": "CIBanco",
  "145": "BBASE",
  "166": "Banco del Bienestar",
  "638": "Nu México",
  "646": "STP",
  "684": "Transfer",
  "706": "Arcus",
  "710": "NVIO",
  "722": "Mercado Pago",
  "723": "Cuenca",
  "728": "Spin by OXXO",
};
