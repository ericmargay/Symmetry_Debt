# Security policy · Política de seguridad

Symmetry Debt holds people's financial records. Reports of security problems are welcome and
taken seriously. · Symmetry Debt guarda registros financieros de personas. Los reportes de
problemas de seguridad son bienvenidos y se toman en serio.

## Reporting a vulnerability · Cómo reportar una vulnerabilidad

**Please do not open a public issue.** Report it privately through GitHub:

**<https://github.com/ericmargay/Symmetry_Debt/security/advisories/new>**
(repository → *Security* → *Report a vulnerability*).

**Por favor no abras un issue público.** Repórtala en privado desde GitHub, en el enlace de
arriba (repositorio → *Security* → *Report a vulnerability*).

Include, if you can · Incluye, si puedes:

- what an attacker could do and what they need for it (an account? a link? nothing?) ·
  qué podría hacer un atacante y qué necesita para lograrlo;
- steps to reproduce it, ideally on a local installation with made-up data ·
  pasos para reproducirlo, de preferencia en una instalación local con datos inventados;
- the version or commit, and whether it runs under a sub-path (`/debt`) or at the domain root ·
  la versión o commit, y si corre bajo una ruta (`/debt`) o en la raíz del dominio.

Never test against other people's data, and never include real names, amounts, bank details or
receipts in a report. · Nunca pruebes con datos de otras personas ni incluyas nombres, importes,
datos bancarios o comprobantes reales en un reporte.

## What to expect · Qué esperar

This is a volunteer-run open source project, so there is no guaranteed response time, but the
aim is to acknowledge a report within 7 days, to keep you informed while it is being fixed, and
to credit you in the advisory if you want. Please give a reasonable time for a fix before
publishing details.

Es un proyecto de código abierto mantenido por voluntarios: no hay un plazo garantizado, pero el
objetivo es acusar recibo en un máximo de 7 días, mantenerte al tanto mientras se corrige y
darte crédito en el aviso si así lo deseas. Por favor da un tiempo razonable para corregirlo
antes de publicar detalles.

## Supported versions · Versiones con soporte

Fixes are made on the `main` branch and included in the next release. Older releases do not
receive separate patches: update to the latest version.

Las correcciones se hacen en la rama `main` y se incluyen en la siguiente versión. Las versiones
anteriores no reciben parches por separado: actualiza a la más reciente.

## Scope · Alcance

In scope · Dentro del alcance — anything that lets somebody:

- read or change another person's **personal records**, contacts, bank accounts or receipts;
- take part in a **shared agreement** without being one of its two participants, or make
  something count as *confirmed by both sides* without both sides confirming it;
- learn something private about a person just by knowing their email address;
- sign in as somebody else, keep a session alive after it was revoked, or bypass rate limits in
  a way that matters;
- change or delete confirmed history (confirmed movements, accepted terms, the audit trail).

Out of scope · Fuera del alcance:

- problems that need a misconfigured installation (for example the development-only mock
  sign-in issuer `AUTH_GOOGLE_ISSUER` pointed at in production, a public S3 bucket, or a leaked
  `.env`);
- denial of service by sheer volume, and findings from automated scanners without a concrete
  impact;
- vulnerabilities in dependencies that are not reachable from this app (do tell us if one is).

How the app is meant to protect data is described in
[docs/en/SECURITY_MODEL.md](docs/en/SECURITY_MODEL.md) ·
[docs/es/SECURITY_MODEL.md](docs/es/SECURITY_MODEL.md).

## For maintainers · Para quienes mantienen el repositorio

Private reports only work if **Settings → Code security → Private vulnerability reporting** is
enabled in the GitHub repository. · Los reportes privados solo funcionan si esa opción está
activada en la configuración del repositorio.
