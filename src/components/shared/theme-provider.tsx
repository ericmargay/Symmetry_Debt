"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light / dark / system. The choice is kept in the browser; it is not personal data. */
export function ThemeProvider({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={nonce}>
      {children}
    </NextThemesProvider>
  );
}
