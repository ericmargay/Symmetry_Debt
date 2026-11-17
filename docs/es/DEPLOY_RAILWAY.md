# Despliegue en Railway, bajo `aminoacid.com.mx/debt`

*[English version](../en/DEPLOY_RAILWAY.md)*

Así está montada la instancia oficial de pruebas, <https://aminoacid.com.mx/debt>. Conecta
Symmetry Debt a un sitio que ya existe **sin cambiar cómo funciona ese sitio**.

> **Primero valida en local.** El camino recomendado es correr la app en tu propia máquina
> —incluso con datos reales— hasta que estés conforme, y solo entonces desplegar. Cómo llevar a
> la nube los datos que capturaste en local está en [LOCAL_TO_CLOUD.md](LOCAL_TO_CLOUD.md).

¿Vas a desplegar en otro lado? [SELF_HOSTING.md](SELF_HOSTING.md) cubre cualquier servidor y
cualquier dominio.

## El esquema

```
visitante ──► Cloudflare ──► borde de Railway (TLS) ──► servicio «sitio» (Caddy, sitio estático)
                                                           │
                                                           │  /debt y /debt/*   (red privada)
                                                           ▼
                                                    servicio «symmetry-debt»  :3000
                                                           │
                                               ┌───────────┴───────────┐
                                               ▼                       ▼
                                      servicio PostgreSQL        volumen /data
                                                                (comprobantes)
```

- El dominio sigue apuntando al servicio `sitio` de siempre. Su Caddyfile gana **un bloque** que
  reenvía `/debt` al servicio nuevo por la red privada de Railway — igual que el bloque que ya
  reenvía `/artech_designer`.
- `symmetry-debt` **no necesita dominio público** propio.
- Todo lo demás del sitio queda intacto. Si se quita el bloque, el sitio queda como estaba.

## 0. Antes de empezar

- [ ] La app funciona en local (`docker compose up -d --build`, o `npm run dev`).
- [ ] Tu cliente OAuth de Google incluye la URI de redirección de producción:
      `https://aminoacid.com.mx/debt/api/auth/callback/google` ([GOOGLE_OAUTH.md](GOOGLE_OAUTH.md)).
- [ ] Tienes los secretos a la mano. Si vas a traer tus datos locales, la `DATA_ENCRYPTION_KEY`
      debe ser **la misma** que usaste en local.
- [ ] La CLI de Railway está instalada y con sesión iniciada (`railway whoami`).

## 1. Crear los servicios

Desde la carpeta de este repositorio:

```bash
railway link -p aminoacid-studio          # el proyecto que ya aloja el sitio

railway add --database postgres           # un servicio PostgreSQL (llamado «Postgres»)

railway add --service symmetry-debt \
  --variables "PORT=3000" \
  --variables "HOSTNAME=::" \
  --variables "NEXT_PUBLIC_BASE_PATH=/debt" \
  --variables "APP_URL=https://aminoacid.com.mx/debt"

railway service link symmetry-debt        # esta carpeta ahora despliega en ese servicio
railway volume add --mount-path /data     # donde se guardan los comprobantes
```

Por qué esas cuatro variables:

| Variable | Por qué |
|---|---|
| `PORT=3000` | Fijo, para que el Caddy del sitio sepa a qué puerto reenviar. |
| `HOSTNAME=::` | Hace que el servidor escuche en IPv6 además de IPv4. La red privada de Railway lo necesita. |
| `NEXT_PUBLIC_BASE_PATH=/debt` | Se lee al **construir** la imagen (Railway pasa las variables del servicio a la construcción de Docker). |
| `APP_URL=https://aminoacid.com.mx/debt` | La dirección pública. De ella salen los enlaces, los correos, las cookies y la redirección de Google. |

## 2. El resto de la configuración

Los secretos es mejor pasarlos por la entrada estándar que dejarlos en el historial de la
terminal:

```bash
# La base de datos: una referencia al servicio PostgreSQL, que Railway resuelve.
# (Comillas simples, para que tu terminal no intente expandir ${{…}}. Comprueba el nombre del
#  servicio con `railway service list` si lo llamaste de otra forma.)
railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --skip-deploys

openssl rand -base64 32 | railway variable set AUTH_SECRET --stdin --skip-deploys
railway variable set AUTH_GOOGLE_ID=…apps.googleusercontent.com --skip-deploys
printf '%s' 'GOCSPX-…' | railway variable set AUTH_GOOGLE_SECRET --stdin --skip-deploys

# Instalación NUEVA: genérala y guarda una copia en un lugar seguro.
openssl rand -base64 32 | railway variable set DATA_ENCRYPTION_KEY --stdin --skip-deploys
# Si TRAES datos de local: usa el valor de tu .env local (ver LOCAL_TO_CLOUD.md).
```

`--skip-deploys` evita un redespliegue por cada variable; el despliegue del paso 3 las toma
todas.

Las opcionales, con sus valores por omisión, están en [`.env.example`](../../.env.example). Las
que más importan en Railway:

| Variable | Cuándo |
|---|---|
| `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` | Para enviar correos de invitación y de aviso. Railway bloquea el SMTP saliente en los planes inferiores a Pro, así que conviene la API HTTP de Resend en lugar de `smtp`. Sin correo la app funciona completa: los enlaces se comparten a mano. |
| `STORAGE_DRIVER=s3` + `S3_*` | Para guardar los comprobantes en un bucket en lugar del volumen. |
| `CRON_SECRET` | Solo si quieres que un programador externo dispare los recordatorios. No hace falta: el servidor los ejecuta solo cada hora. |
| `DEFAULT_TIME_ZONE`, `DEFAULT_CURRENCY` | Con qué empiezan las cuentas nuevas (`America/Mexico_City`, `MXN`). |

`STORAGE_LOCAL_DIR` ya vale `/data/uploads` dentro de la imagen, que queda en el volumen montado
en `/data`. Déjala así.

## 3. Desplegar

```bash
railway up --detach        # construye el Dockerfile y lo despliega (unos minutos)
railway logs               # sigue el arranque
```

Un arranque sano se ve así:

```
[entrypoint] applying database migrations
…
All migrations have been successfully applied.        (o: No pending migrations to apply.)
[entrypoint] starting: node server.js (listening on :::3000, base path '/debt')
```

Qué pasa en cada arranque:

1. el directorio de comprobantes del volumen se entrega al usuario sin privilegios con el que
   corre el servidor (Railway monta los volúmenes a nombre de root);
2. se **aplican las migraciones** pendientes de la base de datos; si fallan, el servidor **no**
   arranca y el despliegue anterior sigue atendiendo;
3. arranca el servidor.

Railway espera a que `GET /debt/api/health` responda `200` antes de pasarle el tráfico
(`healthcheckPath` en [`railway.json`](../../railway.json)). Ese punto también comprueba la base
de datos.

> ¿Construyes para otra ruta base? Cambia a la vez `NEXT_PUBLIC_BASE_PATH`, `APP_URL` **y**
> `healthcheckPath` en `railway.json`.

## 4. Conectar la ruta al sitio

En el repositorio **`aminoacid-studio`**, añade al `Caddyfile` el bloque de
[`deploy/caddy/debt.caddy`](../../deploy/caddy/debt.caddy), dentro del bloque del sitio, junto al
`handle /artech_designer*` que ya existe:

```caddy
	@debt path /debt /debt/*
	handle @debt {
		reverse_proxy symmetry-debt.railway.internal:3000 {
			header_up X-Forwarded-Proto https
		}
	}
```

Después despliega el sitio como siempre, desde su propia carpeta:

```bash
railway up --detach
```

Ese es el único cambio en la infraestructura existente. Notas:

- El filtro es exacto: `/debt` y todo lo que cuelga de `/debt/`. `/debtors` sigue yendo al sitio.
- La ruta **no** se recorta; la app espera ver `/debt`.
- Caddy conserva el `Host` del visitante y añade `X-Forwarded-Host` por su cuenta.
  `X-Forwarded-Proto https` se pone a mano porque Railway termina el TLS antes de Caddy.
- Las cabeceras de seguridad del propio sitio (`X-Frame-Options`, `Referrer-Policy`…) también
  se aplican a `/debt` y son compatibles con las de la app. La app añade su propia
  Content-Security-Policy.

Este bloque exacto se validó dentro de una copia del Caddyfile de producción con Caddy 2.10: la
app responde bajo `/debt` y todas las demás rutas siguen llegando al sitio estático.

## 5. Comprobar

```bash
curl -s https://aminoacid.com.mx/debt/api/health            # {"status":"ok"}
curl -s https://aminoacid.com.mx/debt/api/auth/providers     # callbackUrl debe ser …/debt/api/auth/callback/google
curl -sI https://aminoacid.com.mx/ | head -1                 # el sitio: sin cambios
```

Después abre <https://aminoacid.com.mx/debt> e inicia sesión.

## Cosas que conviene saber

### Cloudflare

El dominio pasa por el proxy de Cloudflare. Dos cosas que revisar en su panel:

- Las funciones que **inyectan scripts en las páginas** — Rocket Loader, Email Address
  Obfuscation, Web Analytics automático — quedan bloqueadas por la Content-Security-Policy de
  la app y pueden romper páginas. Desactívalas para `/debt/*` (con una Configuration Rule).
- No añadas una regla que guarde en caché el HTML bajo `/debt`. Los archivos estáticos de
  `/debt/_next/static/` sí se pueden cachear por mucho tiempo: llevan huella en el nombre.

### La dirección del visitante y los límites de uso

Caddy no confía en los proxies que tiene delante a menos que se le indique, así que con el
Caddyfile actual reemplaza `X-Forwarded-For` por la dirección del borde de Railway. La app ve
entonces esa misma dirección para todos los visitantes.

Casi todos los límites de la app son por **cuenta**, así que para ellos no importa. El único
límite por dirección — iniciar un inicio de sesión — queda entonces compartido entre todos los
visitantes. Para dejar pasar la dirección real, configura `trusted_proxies` en el Caddyfile del
sitio (un bloque global `servers { trusted_proxies static … }` con los rangos de Railway y de
Cloudflare) y pon en la app `TRUSTED_PROXY_HOPS` con el número de proxies que añaden a la
cabecera. Verifica qué llega en realidad antes de confiar en ello.

### Recordatorios

No hay nada que configurar. El servidor revisa los vencimientos por sí mismo cada hora, y el
trabajo nunca repite un recordatorio. Un servicio cron de Railway que llame a
`POST /debt/api/cron/reminders` con `Authorization: Bearer $CRON_SECRET` es opcional e inofensivo
junto al temporizador integrado.

### Comprobantes: volumen o bucket

- **Volumen** (los pasos de arriba): lo más simple. Los respaldos de volumen no vienen
  activados: prográmalos en la configuración del volumen o incluye los archivos en tus propios
  respaldos ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- **Bucket**: define `STORAGE_DRIVER=s3` y las variables `S3_*`. El bucket debe ser **privado**;
  la app es lo único que lo lee. Necesario si algún día corres más de una instancia.

### Un dominio público de Railway

El servicio no lo necesita. Si creas uno para depurar (`railway domain`), recuerda que el inicio
de sesión, las cookies y los enlaces están atados a `APP_URL`: la app solo funciona bien por
`https://aminoacid.com.mx/debt`.

### Si el sitio deja de ser Caddy

Cualquier proxy inverso delante del dominio puede hacer lo mismo: reenviar `/debt` y `/debt/*`
sin recortar la ruta, conservar el `Host` y enviar `X-Forwarded-Proto https`. Por ejemplo, un
Worker de Cloudflare con la ruta `aminoacid.com.mx/debt*` que reenvíe al dominio público del
servicio.

## Actualizar

```bash
git pull
railway up --detach
```

Las migraciones nuevas se aplican al arrancar. Saca un respaldo de la base de datos antes de una
actualización que incluya migraciones:

```bash
scripts/backup.sh --url "<URL pública del servicio PostgreSQL>"
```

## Volver atrás

- **La app**: en el panel de Railway, abre el servicio `symmetry-debt` → *Deployments* → elige
  el anterior → *Rollback*. Un rollback no deshace las migraciones: si la versión nueva cambió
  el esquema, restaura el respaldo que sacaste antes de actualizar
  ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- **La ruta**: quita el bloque `@debt` del Caddyfile del sitio y vuelve a desplegar el sitio.
  `aminoacid.com.mx/debt` simplemente mostrará la página del sitio; nada más cambia.
- **Todo**: elimina del proyecto los servicios `symmetry-debt` y PostgreSQL y el volumen. El
  sitio no se ve afectado.
