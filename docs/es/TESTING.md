# Pruebas

*[English version](../en/TESTING.md)*

Tres capas, de la más rápida a la más completa.

| Capa | Qué cubre | Necesita | Comando |
|---|---|---|---|
| **Unitarias** | `src/domain`: dinero, fechas, CLABE, calendarios, saldos, ciclos de vida | nada | `npm test` |
| **Integración** | `src/server`: todos los servicios, contra un PostgreSQL real con las migraciones reales | PostgreSQL | `npm run test:integration` |
| **Extremo a extremo** | Flujos completos en un navegador, bajo la ruta base `/debt` | PostgreSQL, el inicio de sesión simulado | `npm run test:e2e` |

`npm run check` ejecuta lint, la comprobación de tipos y las pruebas unitarias. `npm run test:all`
ejecuta juntas las unitarias y las de integración. La integración continua
(`.github/workflows/ci.yml`) corre todo esto más una compilación de producción y una prueba de
construcción y arranque de la imagen de Docker.

## Pruebas unitarias

`tests/unit/`, con [Vitest](https://vitest.dev). No necesitan base de datos ni red y corren en
bastante menos de un segundo. Aquí es donde se fijan las reglas: cómo se lee `1,500.50`, por qué
se rechaza `1.500`, cómo se calcula el dígito verificador de una CLABE, cómo se reparten los
pagos sobre un calendario, qué movimientos cuentan para qué saldo.

## Pruebas de integración

`tests/integration/`. Llaman a los servicios exactamente como lo hace la app — con un actor
explícito — contra un PostgreSQL real, así que las restricciones, los disparadores, las
transacciones y los bloqueos son los de verdad.

### La base de datos de pruebas

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL en 127.0.0.1:54329
npm run test:integration
```

- Las pruebas **nunca usan tu base de datos de desarrollo**. Usan una aparte cuyo nombre termina
  en `_test`: por omisión tu `DATABASE_URL` con `_test` añadido (`symmetry_debt_test`), o lo que
  diga `TEST_DATABASE_URL`. Se niegan a correr contra un nombre que no termine en `_test`.
- Antes de la corrida, la base de datos se crea si no existe y se aplican las migraciones reales
  del proyecto (`tests/integration/global-setup.ts`).
- Cada prueba empieza con las tablas vacías.
- Nada sale de la máquina: el correo saliente se intercepta, los comprobantes van a un
  directorio temporal y los límites de uso están apagados salvo que una prueba los encienda.

### Qué demuestran

Además de los caminos normales, cada área tiene pruebas de lo que **no** debe ocurrir:

- otra persona no puede ver ni tocar un registro personal, ni nada de un acuerdo compartido;
- quien registró un movimiento no puede confirmarlo; nadie acepta su propia propuesta;
- un enlace para compartir es de un solo uso, vence, y no le abre nada a quien solo conoce un
  correo;
- convertir un registro personal lo deja byte por byte como estaba hasta que la otra persona
  acepta — y también después, si rechaza;
- dos pagos simultáneos no pueden pasarse del saldo; la misma petición enviada tres veces crea
  una sola fila; tres aprobaciones simultáneas confirman una vez;
- la propia base de datos rechaza editar un movimiento confirmado, cambiar la modalidad de una
  deuda, reescribir condiciones aceptadas o tocar la auditoría;
- los datos bancarios no están en claro en ninguna columna, y la otra parte solo los ve cuando
  se compartieron de forma explícita;
- un archivo se acepta por lo que son sus bytes, no por su nombre.

## Pruebas de extremo a extremo

`tests/e2e/`, con [Playwright](https://playwright.dev). Manejan un navegador real contra la
**compilación de producción** de la app bajo su ruta base, iniciando sesión mediante el **emisor
simulado** en lugar de Google.

```bash
docker compose -f docker-compose.dev.yml up -d     # PostgreSQL
npx playwright install chromium                    # una vez
npm run test:e2e
```

Qué hace ese comando:

1. `tests/e2e/prepare.ts` borra y vuelve a crear una base de datos propia — el nombre de tu base
   de desarrollo más `_e2e_test`, o lo que diga `E2E_DATABASE_URL` (el nombre debe terminar en
   `_test`) — aplica las migraciones y compila la app (`E2E_SKIP_BUILD=1` reutiliza la última
   compilación).
2. Playwright arranca el emisor simulado en el puerto 4466 y **dos** copias del servidor
   compilado: una en el puerto 3100 sin enlaces de donación y otra en el 3101 con enlaces de
   donación configurados, para ejercitar ambas configuraciones. Su configuración está fija en
   `tests/e2e/env.ts`; tu `.env` no se lee.
3. Las pruebas corren en dos proyectos de Playwright: `desktop` (Desktop Chrome) y `mobile`
   (Pixel 7, solo `mobile.spec.ts`).

| Archivo | Qué recorre |
|---|---|
| `auth-i18n.spec.ts` | Inicio de sesión bajo `/debt`, el regreso a la página que se pidió, cierre de sesión, rechazo de redirecciones abiertas, la CSP, e idiomas: español por omisión, inglés a petición, nunca impuesto por el navegador. |
| `personal.spec.ts` | Seguimiento personal desde el registro hasta la liquidación, detalles de efectivo y de transferencia, cuentas bancarias (CLABE validada, enmascarada, privada). |
| `shared.spec.ts` | Un acuerdo compartido con dos personas con sesión: enlace, aceptación de ambas, pagos que solo cuentan una vez confirmados; una invitación que nombra un correo; la conversión de un registro personal. |
| `receipts-donations.spec.ts` | Comprobantes (adjuntar, abrir, privados, no confirman nada), la app con y sin enlaces de donación, exportación de datos. |
| `mobile.spec.ts` | Todo el flujo personal en una pantalla del tamaño de un teléfono. |

Nada toca tus datos de desarrollo, y los comprobantes van a un directorio temporal.

### El emisor simulado de inicio de sesión

`scripts/mock-oidc.mjs` es un pequeño servidor OpenID Connect que hace las veces de
`accounts.google.com`. El código real de inicio de sesión de la app corre sin cambios —
descubrimiento, código de autorización con PKCE, intercambio de tokens, un ID token firmado —
pero en lugar del selector de cuentas de Google hay un formulario donde la prueba (o tú) escribe
quién quiere ser.

```bash
npm run dev:auth-mock               # http://localhost:4455
# en .env:  AUTH_GOOGLE_ISSUER=http://localhost:4455
#           AUTH_GOOGLE_ID=symmetry-debt-local
#           AUTH_GOOGLE_SECRET=symmetry-debt-local-secret
```

Solo redirige de vuelta a `localhost`, y nunca debe configurarse en una instalación real: da por
bueno cualquier correo.

## Comprobar cosas a mano

- **Correo**: `docker compose -f docker-compose.dev.yml --profile extras up -d` arranca Mailpit.
  Define `EMAIL_PROVIDER=smtp` y `SMTP_URL=smtp://localhost:1025`, y lee lo que envía la app en
  <http://localhost:8025>.
- **Almacenamiento S3**: el mismo perfil arranca MinIO (consola en <http://localhost:9001>). Crea
  un bucket y define `STORAGE_DRIVER=s3`, `S3_ENDPOINT=http://localhost:9000`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
- **La imagen de Docker**: `docker compose up -d --build`, y después
  `curl http://localhost:3000/debt/api/health`.
- **Respaldos**: `scripts/backup.sh --dev` seguido de
  `scripts/restore.sh backups/ARCHIVO.dump --dev --database restore_check --yes`.

## Escribir pruebas

- Una regla sobre importes, fechas o estados va en `src/domain` con una prueba unitaria.
- Todo lo que trate de quién puede hacer qué, o de qué se guarda, necesita una prueba de
  integración — y uno de sus casos debe ser el rechazo.
- Usa personas e importes inventados. Nunca pongas datos reales en una prueba ni en un fixture.
