# Guía para colaborar

*[English version](CONTRIBUTING.en.md)*

Gracias por tu interés en Symmetry Debt. Es un proyecto de código abierto (MIT), mantenido por
voluntarios. Esta guía explica cómo montar el entorno, qué reglas sigue el código y qué se
espera de un cambio antes de integrarlo.

Al participar aceptas el [código de conducta](CODE_OF_CONDUCT.md). Si encontraste un problema de
seguridad, **no abras un issue**: sigue [SECURITY.md](SECURITY.md).

## Lo que el proyecto promete (y ningún cambio puede romper)

1. **Un registro personal nunca se presenta como confirmado por ambas partes.** Lo que una
   persona anotó para sí misma y lo que dos personas acordaron son cosas distintas, en la base
   de datos, en los cálculos y en la pantalla.
2. **Nada privado de una persona se vuelve visible para otra** sin que su titular lo comparta de
   forma explícita. Conocer un nombre o un correo no da acceso a nada.
3. **El historial confirmado no se altera.** Se corrige con movimientos nuevos (reversos,
   ajustes) que la otra parte aprueba, nunca editando o borrando.
4. **Los importes son exactos.** Nunca pasan por un número de punto flotante.
5. **Ninguna función depende de una donación.**

## Preparar el entorno

Necesitas Node.js 24 (funciona desde la 22; hay un `.nvmrc`), npm y Docker.

```bash
git clone https://github.com/ericmargay/Symmetry_Debt.git
cd Symmetry_Debt

./scripts/setup.sh --mock-auth                    # crea .env con secretos e inicio de sesión simulado
docker compose -f docker-compose.dev.yml up -d    # PostgreSQL en 127.0.0.1:54329
npm install                                       # también genera el cliente de Prisma
npm run db:deploy                                 # aplica las migraciones

npm run dev:auth-mock                             # en otra terminal: emisor OIDC simulado
npm run dev                                       # http://localhost:3000/debt
```

`--mock-auth` configura un emisor de identidad local que sustituye a Google **solo para
desarrollo**: acepta cualquier correo que escribas. Si prefieres iniciar sesión con Google de
verdad, omite esa opción y sigue [docs/es/GOOGLE_OAUTH.md](docs/es/GOOGLE_OAUTH.md).

Servicios opcionales para probar correo y almacenamiento S3:

```bash
docker compose -f docker-compose.dev.yml --profile extras up -d   # Mailpit (:8025) y MinIO (:9001)
```

## Cómo está organizado

```
prisma/            esquema y migraciones (la segunda migración añade restricciones y disparadores)
messages/          es.json y en.json: todos los textos de la interfaz y de los correos
src/domain/        reglas puras, sin acceso a nada: dinero, fechas, CLABE, calendarios, saldos,
                   condiciones, ciclos de vida
src/schemas/       validación de entradas (Zod), compartida por formularios y servidor
src/server/        todo lo que toca el mundo: base de datos, sesión, cifrado, correo, archivos,
                   auditoría, notificaciones y, en services/, los casos de uso
src/actions/       server actions: llaman a los servicios con la persona que tiene la sesión
src/app/           páginas y rutas (Next.js App Router)
src/components/    componentes de interfaz
src/i18n/          configuración de idiomas
tests/unit/        pruebas de src/domain
tests/integration/ pruebas de src/server contra un PostgreSQL real
tests/e2e/         flujos completos en el navegador (Playwright)
docs/              documentación (es/ y en/)
```

La explicación completa está en [docs/es/ARCHITECTURE.md](docs/es/ARCHITECTURE.md).

## Reglas del código

### Dinero

- Todo importe es un `bigint` en la **unidad mínima** de su moneda (centavos). En la base de
  datos es `BIGINT`.
- Lo que escribe una persona se interpreta con `parseAmount` (`src/domain/money.ts`) y se muestra
  con `formatMoney`. **Nunca** uses `Number`, `parseFloat`, `toFixed` ni aritmética decimal con
  importes.
- En JSON (instantáneas de condiciones, eventos, exportación) los importes viajan como cadenas
  de dígitos.
- Nunca sumes importes de monedas distintas.

### Fechas

- Una fecha de pago o de vencimiento es una **fecha de calendario**, no un instante: viaja como
  `"2026-03-05"` y se guarda en columnas `DATE` (`src/domain/dates.ts`).
- La fecha en que ocurrió algo (`effectiveDate`) y el momento en que se registró (`recordedAt`)
  son campos distintos, a propósito.

### Textos

- Ningún texto visible va escrito dentro de un componente. Todo sale de `messages/es.json` **y**
  `messages/en.json`, con las mismas claves en ambos. El español es la referencia: las claves se
  comprueban al compilar contra `es.json`.
- Los errores de validación y de negocio son claves (`validation.*`, `errors.*`), no frases.
- Los correos y las notificaciones se redactan en el idioma de quien los recibe.

### Servicios y autorización

- Un servicio recibe de forma explícita a la persona que actúa (`Actor`) y **comprueba él mismo**
  si puede hacer lo que pide. La interfaz nunca es la única barrera.
- El acceso a una deuda pasa por `requireDebtAccess`: registro personal → solo su titular;
  acuerdo compartido → solo sus dos participantes. A quien no tiene acceso se le responde
  «no encontrado», para no revelar que algo existe.
- Todo cambio sobre una deuda ocurre en una transacción que primero bloquea su fila
  (`lockDebt`) y después lee el estado; así dos peticiones simultáneas no actúan sobre datos
  viejos.
- Cada cambio escribe su evento de auditoría en la misma transacción.
- Las operaciones que crean algo aceptan una clave de idempotencia: repetir el envío no duplica.

### Las dos modalidades

- `PERSONAL`: los movimientos son `PERSONAL_RECORD`; su titular los edita y borra con libertad.
- `SHARED`: un movimiento empieza `PENDING` y solo cuenta en el saldo cuando la **otra** parte lo
  aprueba (`CONFIRMED`). Quien lo registró no puede confirmarlo.
- Convertir un registro personal crea un acuerdo **nuevo** que lo referencia; el registro
  original no se modifica.

### Base de datos

- Cambia `prisma/schema.prisma` y genera la migración: `npm run db:migrate -- --name lo_que_cambia`.
- Lo que el esquema no puede expresar (restricciones `CHECK`, disparadores) se escribe a mano en
  el SQL de una migración. Mira `prisma/migrations/*_integrity_rules/`.
- Nunca edites una migración que ya se publicó: crea otra.
- Los índices parciales se declaran en el esquema (`where: raw("…")`). Escribe el predicado
  tal como PostgreSQL lo guarda (por ejemplo `a <> 'X' AND a <> 'Y'` en lugar de `a NOT IN (…)`);
  si no, Prisma creerá que el índice cambió en cada migración.
- `prisma`, `@prisma/client` y `@prisma/adapter-pg` se actualizan juntos y a mano.

### Componentes de interfaz

- Los componentes de `src/components/ui` vienen de shadcn/ui (Radix). Se añaden con
  `npx shadcn@latest add <nombre>`; su CSS común está incluido en `src/app/shadcn.css`.
- Colores, tipografías y radios son tokens en `src/app/globals.css`. Usa los tokens, no colores
  literales, para que los temas claro y oscuro sigan funcionando.

### Seguridad

- No registres en los logs secretos, tokens ni datos personales.
- No añadas lugares donde guardar tokens de proveedores, contraseñas o datos de tarjetas.
- Un archivo es lo que dice su contenido, no su nombre ni el tipo que anuncia el navegador.

## Pruebas

| Qué cambiaste | Qué pruebas se esperan | Cómo correrlas |
|---|---|---|
| `src/domain` | unitarias | `npm test` |
| `src/server`, `prisma/` | de integración, con PostgreSQL real | `npm run test:integration` |
| páginas, inicio de sesión, flujos | de extremo a extremo | `npm run test:e2e` |

`npm run check` ejecuta lint, tipos y pruebas unitarias. Las pruebas de integración crean y usan
una base de datos aparte cuyo nombre termina en `_test`; nunca tocan tus datos de desarrollo.
Más detalles en [docs/es/TESTING.md](docs/es/TESTING.md).

Un cambio que toca permisos, saldos o aprobaciones necesita una prueba que demuestre el caso
que **no** debe ocurrir (otra persona no puede verlo, quien registró no puede confirmar, etc.).

## Enviar un cambio

1. Abre un issue antes si el cambio es grande o cambia el comportamiento.
2. Trabaja en una rama. Haz commits pequeños con mensajes que digan qué cambia y por qué.
3. Antes de abrir el pull request: `npm run check` y las pruebas que correspondan.
4. Actualiza la documentación (`README`, `docs/`, `.env.example`) si cambia el comportamiento,
   la configuración o el despliegue. La documentación principal existe en español y en inglés.
5. Describe en el pull request qué cambia, por qué y cómo lo comprobaste.

## Traducciones

Para corregir un texto, edita la misma clave en `messages/es.json` y `messages/en.json`. Para
proponer un idioma nuevo abre un issue primero: hay que añadirlo en `src/i18n/config.ts`,
traducir el catálogo completo y decidir el formato de fechas y monedas.

## Licencia

Al contribuir aceptas que tu aportación se publique bajo la [licencia MIT](LICENSE) del proyecto.
