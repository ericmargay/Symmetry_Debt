# Symmetry Debt

**Two sides. One agreement.** · *Dos partes. Un acuerdo.*

*[English version](README.en.md)*

Symmetry Debt es una aplicación web de código abierto para llevar deudas entre personas: lo que
debes, lo que te deben, cómo se va a pagar y qué se ha pagado. Sirve para dos cosas distintas, y
nunca las confunde:

- **Seguimiento personal.** Tu propio registro de una deuda. Solo tú lo ves. La otra persona no
  necesita cuenta ni se entera.
- **Acuerdo compartido.** Las dos partes entran, revisan las mismas condiciones y las aceptan.
  A partir de ahí, cada pago cuenta solo cuando la **otra** parte lo confirma.

Instancia oficial de pruebas: <https://aminoacid.com.mx/debt>

## El principio

> **Un registro personal nunca se trata como confirmado por ambas partes.**

Lo que una persona anotó para sí misma y lo que dos personas acordaron son cosas distintas, y la
app las mantiene separadas en todos los niveles:

- en pantalla, cada cifra dice qué es: *registrado* (solo tú lo anotaste), *confirmado* (ambas
  partes), *por confirmar* (espera a la otra parte) o *propuesto* (aún no hay acuerdo);
- en los cálculos, el saldo confirmado solo cuenta movimientos que la otra parte aprobó;
- en la base de datos, las filas de una modalidad no pueden contener los estados de la otra, y
  lo confirmado no se puede editar ni borrar: se corrige con un reverso o un ajuste que la otra
  parte también aprueba.

Convertir un registro personal en acuerdo compartido no cambia esto: se crea una **propuesta
nueva** con lo que elijas compartir, y nada queda confirmado hasta que la otra persona lo acepta.
Tu registro original sigue intacto.

## Qué hace

- Deudas en cualquier sentido (debo / me deben), con pago único o en cuotas y calendario propio.
- Pagos parciales, anticipados y atrasados; el saldo se recalcula siempre a partir de los
  movimientos.
- Acuerdos compartidos por enlace: quien propone envía el enlace por donde quiera; la otra
  persona inicia sesión con Google y acepta, rechaza o pide cambios.
- Versiones de las condiciones: ambas partes aceptan siempre exactamente la misma.
- Métodos de pago como dato de registro (efectivo, transferencia, depósito, tarjeta, otro). **La
  app no mueve dinero.**
- Cuentas bancarias para recibir pagos, con CLABE validada y cifrada; solo se muestran a la otra
  parte de un acuerdo si su titular las comparte para ese acuerdo.
- Comprobantes (PDF, JPG, PNG, WebP) privados. Un comprobante es evidencia; no confirma nada.
- Recordatorios de vencimiento y avisos dentro de la app; correo opcional.
- Historial completo de cada deuda, exportación de tus datos en JSON y eliminación de cuenta.
- Español (predeterminado) e inglés. Importes exactos, sin punto flotante.
- Se puede servir en la raíz de un dominio o bajo una ruta (`/debt`).

No tiene analítica, publicidad ni rastreadores, y no guarda contraseñas bancarias, NIP ni datos
de tarjeta.

## Inicio rápido (en tu máquina)

Necesitas Node.js 24 (funciona desde la 22), npm y Docker.

```bash
git clone <URL de este repositorio>
cd Symmetry_Debt

./scripts/setup.sh --mock-auth                    # crea .env con secretos e inicio de sesión simulado
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL en 127.0.0.1:54329
npm install
npm run db:deploy                                 # aplica las migraciones

npm run dev:auth-mock                             # en otra terminal: sustituto local de Google
npm run dev                                       # http://localhost:3000/debt
```

### Inicio de sesión: simulado o Google real

| | Cómo | Para qué |
|---|---|---|
| **Simulado** | `./scripts/setup.sh --mock-auth` y `npm run dev:auth-mock` | Probar y desarrollar sin configurar nada. Acepta cualquier correo que escribas, así que **solo** sirve en tu máquina. |
| **Google real** | `./scripts/setup.sh`, y pon `AUTH_GOOGLE_ID` y `AUTH_GOOGLE_SECRET` en `.env` | Uso real. Crea un cliente OAuth «Aplicación web» en Google Cloud y registra la URI de redirección `http://localhost:3000/debt/api/auth/callback/google`. |

El paso a paso de Google está en [docs/es/GOOGLE_OAUTH.md](docs/es/GOOGLE_OAUTH.md).

> **Primero en local, después en la nube.** Puedes usar la app en tu máquina con datos reales y
> mudarlos más tarde: [docs/es/LOCAL_TO_CLOUD.md](docs/es/LOCAL_TO_CLOUD.md).

## Todo en Docker

Para correr la app completa (aplicación + PostgreSQL + volumen de comprobantes) sin Node.js:

```bash
./scripts/setup.sh                 # crea .env y genera los secretos
$EDITOR .env                       # APP_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
docker compose up -d --build       # http://localhost:3000/debt
```

`docker compose down -v` borra los datos; `down` a secas los conserva. Para un servidor con
dominio y HTTPS, ver [docs/es/SELF_HOSTING.md](docs/es/SELF_HOSTING.md).

## Configuración

Todas las variables, comentadas, están en [`.env.example`](.env.example). Las principales:

| Variable | Para qué | |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | Ruta dentro del dominio: `/debt` (predeterminada) o `/` para la raíz. | se lee **al compilar** |
| `APP_URL` | Dirección pública, incluida la ruta base: `http://localhost:3000/debt`. De ella salen los enlaces, las cookies y la redirección de Google. | obligatoria en producción |
| `DATABASE_URL` | Conexión a PostgreSQL. | obligatoria |
| `AUTH_SECRET` | Firma las sesiones. `openssl rand -base64 32` | obligatoria |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Cliente OAuth de Google. | obligatorias |
| `DATA_ENCRYPTION_KEY` | Cifra los datos bancarios. `openssl rand -base64 32`. **Respáldala.** | necesaria para guardar cuentas |
| `STORAGE_DRIVER`, `STORAGE_LOCAL_DIR`, `S3_*` | Dónde se guardan los comprobantes: directorio local o bucket S3. | opcional |
| `EMAIL_PROVIDER`, `SMTP_URL`, `RESEND_API_KEY` | Correo (`none`, `smtp`, `resend`). Sin correo la app funciona completa. | opcional |
| `DONATE_*`, `PROJECT_REPO_URL` | Enlaces de donación y del repositorio que muestra tu instalación. | opcional |

### La ruta base

La app puede vivir en `https://ejemplo.org/debt` o en `https://debt.ejemplo.org`. La ruta queda
**compilada** dentro de la app: para cambiarla hay que definir `NEXT_PUBLIC_BASE_PATH` y volver a
compilar (o reconstruir la imagen de Docker), y ajustar `APP_URL` para que coincida. La URI de
redirección de Google es siempre `<APP_URL>/api/auth/callback/google`.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en <http://localhost:3000/debt>. |
| `npm run build` | Genera el cliente de Prisma y compila para producción. |
| `npm start` | Arranca la compilación de producción (`scripts/start-standalone.mjs`). |
| `npm run check` | Lint, tipos y pruebas unitarias. |
| `npm test` | Pruebas unitarias. |
| `npm run test:integration` | Pruebas de los servicios contra un PostgreSQL real (base de datos `…_test`). |
| `npm run test:e2e` | Pruebas en navegador (Playwright) sobre la compilación de producción. |
| `npm run import:debt -- --email <correo> --file <archivo.json>` | Importa un registro personal desde un archivo ([ejemplo](scripts/examples/personal-debt.example.json)). |
| `npm run db:deploy` | Aplica las migraciones pendientes. |
| `npm run db:migrate` | Crea y aplica una migración nueva (desarrollo). |
| `npm run db:generate` | Regenera el cliente de Prisma. |
| `npm run db:studio` | Abre Prisma Studio. |
| `npm run dev:auth-mock` | Emisor simulado de inicio de sesión (solo desarrollo). |
| `scripts/backup.sh`, `scripts/restore.sh` | Respaldo y restauración de la base de datos. |

## Cómo está hecha

Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma ·
Auth.js (Google) · next-intl · Zod · Vitest · Playwright.

```
prisma/        esquema y migraciones
messages/      textos en español e inglés
src/domain/    reglas puras: dinero, fechas, calendarios, saldos, ciclos de vida
src/server/    base de datos, sesión, cifrado, correo, archivos y los servicios (casos de uso)
src/actions/   server actions
src/app/       páginas y rutas
src/components/ interfaz
tests/         unitarias, integración y extremo a extremo
docs/          documentación (es/ y en/)
deploy/        ejemplos de proxy inverso (Caddy, nginx)
scripts/       instalación, respaldo, importación y arranque
```

## Documentación

Índice bilingüe: [docs/README.md](docs/README.md).

| Tema | Español | English |
|---|---|---|
| Arquitectura | [ARCHITECTURE](docs/es/ARCHITECTURE.md) | [ARCHITECTURE](docs/en/ARCHITECTURE.md) |
| Cliente OAuth de Google | [GOOGLE_OAUTH](docs/es/GOOGLE_OAUTH.md) | [GOOGLE_OAUTH](docs/en/GOOGLE_OAUTH.md) |
| Instalación propia con Docker | [SELF_HOSTING](docs/es/SELF_HOSTING.md) | [SELF_HOSTING](docs/en/SELF_HOSTING.md) |
| Despliegue en Railway | [DEPLOY_RAILWAY](docs/es/DEPLOY_RAILWAY.md) | [DEPLOY_RAILWAY](docs/en/DEPLOY_RAILWAY.md) |
| De local a la nube | [LOCAL_TO_CLOUD](docs/es/LOCAL_TO_CLOUD.md) | [LOCAL_TO_CLOUD](docs/en/LOCAL_TO_CLOUD.md) |
| Respaldo y recuperación | [BACKUP_AND_RECOVERY](docs/es/BACKUP_AND_RECOVERY.md) | [BACKUP_AND_RECOVERY](docs/en/BACKUP_AND_RECOVERY.md) |
| Datos y privacidad | [DATA_AND_PRIVACY](docs/es/DATA_AND_PRIVACY.md) | [DATA_AND_PRIVACY](docs/en/DATA_AND_PRIVACY.md) |
| Modelo de seguridad | [SECURITY_MODEL](docs/es/SECURITY_MODEL.md) | [SECURITY_MODEL](docs/en/SECURITY_MODEL.md) |
| Pruebas | [TESTING](docs/es/TESTING.md) | [TESTING](docs/en/TESTING.md) |

## Seguridad

Si encuentras una vulnerabilidad, **no abras un issue público**: sigue [SECURITY.md](SECURITY.md)
para reportarla en privado. Cómo protege la app los datos está en
[docs/es/SECURITY_MODEL.md](docs/es/SECURITY_MODEL.md).

## Colaborar

Las contribuciones son bienvenidas: lee [CONTRIBUTING.md](CONTRIBUTING.md) y el
[código de conducta](CODE_OF_CONDUCT.md).

## Donaciones

Symmetry Debt es gratuita y **ninguna función depende de una donación**. Las donaciones son
voluntarias y ocurren fuera de la app, en la plataforma que elija quien opera cada instalación:
los enlaces se configuran con las variables `DONATE_*`, y si no hay ninguno configurado la app no
muestra nada al respecto. La app nunca procesa pagos.

## Licencia

[MIT](LICENSE).
