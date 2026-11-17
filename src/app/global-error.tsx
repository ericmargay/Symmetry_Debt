"use client";

// Last resort, when even the root layout cannot render: no translations, no styles to rely on.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, padding: "1.5rem", textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem" }}>Symmetry Debt</h1>
          <p>Algo salió mal. / Something went wrong.</p>
          <button type="button" onClick={reset} style={{ marginTop: "1rem", padding: "0.6rem 1.2rem", borderRadius: "0.5rem", border: "1px solid #999", background: "transparent", font: "inherit", cursor: "pointer" }}>
            Reintentar / Try again
          </button>
        </div>
      </body>
    </html>
  );
}
