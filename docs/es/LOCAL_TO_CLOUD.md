# Primero en local, después en la nube

*[English version](../en/LOCAL_TO_CLOUD.md)*

La forma recomendada de adoptar Symmetry Debt: **córrelo en tu propia máquina hasta que confíes
en él — con datos reales si quieres — y pásalo a la nube después**, llevándote esos datos. No
hace falta publicar nada para probarlo.

Esta guía cubre las dos mitades: correr en local sin perder tus datos, y mudarlos.

## Parte 1 — Correr en local con datos que piensas conservar

Cualquiera de las dos formas sirve. Elige una y quédate con ella.

### A. Todo en Docker (lo más parecido a como correrá en la nube)

```bash
./scripts/setup.sh
$EDITOR .env                       # AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET  (ver «Iniciar sesión» abajo)
docker compose up -d --build       # http://localhost:3000/debt
```

Tus datos viven en dos volúmenes de Docker: `symmetry-debt_db-data` (base de datos) y
`symmetry-debt_uploads` (comprobantes).

### B. Modo desarrollo

```bash
./scripts/setup.sh
docker compose -f docker-compose.dev.yml up -d
npm install && npm run db:deploy && npm run dev      # http://localhost:3000/debt
```

Tus datos viven en el volumen de Docker `symmetry-debt-dev_dev-db` (base de datos) y en la
carpeta `./.data/uploads` (comprobantes).

### Que no se pierdan

- `docker compose stop` / `down` conservan los volúmenes. **`down -v` los borra.** También
  «Clean / Purge data» en Docker Desktop.
- Respalda antes de cualquier cosa arriesgada, y de vez en cuando de todos modos:
  `scripts/backup.sh --compose` (o `--dev`). Ver [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).
- Guarda una copia del `.env` en otro lado. En especial `DATA_ENCRYPTION_KEY`: los datos
  bancarios que guardes solo se podrán leer con ese valor.

### Iniciar sesión estando en local

**Lo mejor: inicio de sesión real con Google, también en local.** Crea el cliente OAuth una vez
([GOOGLE_OAUTH.md](GOOGLE_OAUTH.md)) y registra las dos URI de redirección — la local y la
futura pública. Las cuentas que crees en local son entonces las mismas en la nube: después de la
mudanza entras y todo está ahí.

**También sirve: el inicio de sesión simulado** (`./scripts/setup.sh --mock-auth` +
`npm run dev:auth-mock`), que no necesita configurar Google. Funciona con el modo desarrollo
(B). Si lo usas con datos que piensas conservar:

- **escribe tus correos reales** en el formulario del simulador — el tuyo y el de quien lo
  pruebe contigo;
- cuando esos datos corran después en una instalación con inicio de sesión real de Google, la
  primera vez que entre **quien de verdad es titular de cada correo**, la cuenta pasa a ser suya
  y la identidad simulada se descarta. Nadie más puede reclamarla.

Una cuenta creada con un correo inventado (`ana@example.com`) no se podrá reclamar nunca, porque
nadie puede demostrarle a Google que es suyo.

> El simulador da por bueno cualquier correo que alguien escriba. Úsalo solo en tu máquina.

### Cargar una deuda desde un archivo

Para no capturar a mano un registro personal, descríbelo en un archivo JSON (los mismos campos
que el formulario de «nueva deuda» en modo personal; ejemplo en
[`scripts/examples/personal-debt.example.json`](../../scripts/examples/personal-debt.example.json))
e impórtalo:

```bash
npm run import:debt -- --email tu-correo@gmail.com --file .data/imports/mi-deuda.json
```

Pasa por el mismo servicio que el formulario, así que aplican las mismas validaciones. Si nadie
ha entrado aún con ese correo, la cuenta se crea sin reclamar y la primera persona que inicie
sesión con ese correo **verificado** la encuentra con la deuda ya cargada. Ejecutarlo dos veces
con el mismo archivo no duplica nada. Guarda tus archivos reales en `.data/imports/`, que git
ignora.

## Parte 2 — Pasar a la nube

El ejemplo usa Railway ([DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)); los pasos son los mismos para
cualquier servidor ([SELF_HOSTING.md](SELF_HOSTING.md)).

### 1. Despliega la app, vacía, con la misma clave de cifrado

Sigue la guía de despliegue, con una diferencia: **pon en `DATA_ENCRYPTION_KEY` el valor de tu
`.env` local** en lugar de generar uno nuevo. `AUTH_SECRET` puede ser nuevo.

Déjala arrancar una vez y comprueba `<APP_URL>/api/health`. La base de datos ya tiene la
estructura correcta y ningún dato. Todavía no compartas la dirección.

### 2. Deja de escribir en local

```bash
docker compose stop app            # A — o simplemente detén `npm run dev` en B
```

### 3. Respalda la base de datos local

```bash
scripts/backup.sh --compose        # A
scripts/backup.sh --dev            # B
```

### 4. Restáurala en la base de datos de la nube

Usa la URL de conexión **pública** de la base de datos (en Railway: `DATABASE_PUBLIC_URL` del
servicio PostgreSQL):

```bash
scripts/restore.sh backups/symmetry-debt-compose-….dump --url "postgresql://…"
```

Muestra el destino y pide confirmación. Reemplaza el contenido (vacío) de la base de la nube con
tus datos, en una sola transacción.

Usa la misma versión mayor de PostgreSQL en ambos lados — la 17 — o una más nueva en la nube.

### 5. Copia los comprobantes

Sáltate esto si nunca adjuntaste un archivo.

Primero ponlos en una carpeta normal:

```bash
# A — fuera del volumen de Docker
mkdir -p uploads-export && docker run --rm -v symmetry-debt_uploads:/data:ro -v "$PWD/uploads-export:/out" alpine cp -a /data/uploads/. /out/

# B — ya son una carpeta: ./.data/uploads
```

Después colócalos donde la instalación de la nube guarda los comprobantes:

| Almacenamiento en la nube | Cómo |
|---|---|
| Un volumen de Railway montado en `/data` | `railway volume files upload ./uploads-export /uploads` — y comprueba con `railway volume files list /uploads`. La carpeta debe quedar como `/data/uploads/receipts/…` dentro del contenedor. |
| El volumen de Docker de otro servidor | Copia la carpeta (`rsync`, `scp`) y cárgala en el volumen: `docker run --rm -v symmetry-debt_uploads:/data -v "$PWD/uploads-export:/in:ro" alpine cp -a /in/. /data/uploads/` |
| Un bucket S3 (`STORAGE_DRIVER=s3`) | Sube el **contenido** de la carpeta a la raíz del bucket, conservando las rutas `receipts/…`: `aws s3 sync ./uploads-export s3://tu-bucket/` |

Las rutas dentro de la carpeta (`receipts/2026/11/…`) son las que la base de datos referencia;
déjalas como están.

### 6. Reinicia y comprueba

```bash
railway redeploy --service symmetry-debt --yes     # o: docker compose restart app
```

Después, en la dirección pública:

- [ ] Inicia sesión con tu cuenta de Google → tus deudas están ahí.
- [ ] Abre una cuenta bancaria → se muestra la CLABE (prueba que la clave de cifrado coincide).
- [ ] Abre un comprobante → se muestra el archivo (prueba que los comprobantes se copiaron).
- [ ] Si en local usaste el inicio de sesión simulado: entra con **el mismo correo** → la cuenta
      es tuya, con todo dentro.

### 7. Después

- **Los enlaces de invitación enviados desde la instalación local no le sirven a nadie más**:
  apuntan a `localhost`. Abre cada acuerdo pendiente en la instalación de la nube y genera un
  enlace nuevo.
- Conserva un tiempo el último respaldo local. Cuando estés seguro, elimina los datos locales:
  `docker compose down -v` (y borra `./.data` en modo desarrollo).
- A partir de ahora, respalda la instalación de la nube: `scripts/backup.sh --url "…"`.

## Qué viaja y qué no

| | |
|---|---|
| Deudas, acuerdos, movimientos, historial, contactos, notificaciones, preferencias | En el respaldo de la base de datos. |
| Cuentas y sus identidades de Google | En el respaldo. Las identidades reales de Google siguen funcionando; las simuladas se reemplazan en el primer inicio de sesión real. |
| Sesiones abiertas | Técnicamente en el respaldo, pero las cookies pertenecen a la dirección anterior. Simplemente todo mundo vuelve a iniciar sesión. |
| Datos bancarios | En el respaldo, **cifrados**. Legibles solo con la misma `DATA_ENCRYPTION_KEY`. |
| Comprobantes | **No** están en la base de datos. Se copian aparte (paso 5). |
| Configuración (`.env`) | **No** está en la base de datos. Se define en el nuevo servidor. |
