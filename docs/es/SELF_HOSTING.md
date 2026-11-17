# Instalación propia con Docker

*[English version](../en/SELF_HOSTING.md)*

Symmetry Debt corre donde corra Docker: tu laptop, un VPS pequeño, un servidor en casa. Nada en
él depende de `aminoacid.com.mx` ni de ninguna cuenta del desarrollador original.

Necesitas Docker con el plugin Compose, un cliente OAuth de Google
([GOOGLE_OAUTH.md](GOOGLE_OAUTH.md)) y, para cualquier cosa más allá de tu propia máquina, un
dominio con HTTPS.

## 1. Arrancarlo

```bash
git clone https://github.com/ericmargay/Symmetry_Debt.git
cd Symmetry_Debt

./scripts/setup.sh                 # crea .env y genera los secretos
$EDITOR .env                       # APP_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
docker compose up -d --build
```

Abre <http://localhost:3000/debt>.

Lo que obtienes ([`docker-compose.yml`](../../docker-compose.yml)):

| Servicio | Qué es |
|---|---|
| `app` | La aplicación, construida con el [`Dockerfile`](../../Dockerfile). Aplica las migraciones de la base de datos cada vez que arranca y después atiende en el puerto 3000. |
| `db` | PostgreSQL 17. **No** se publica hacia la máquina: solo la app habla con él. |
| volumen `db-data` | La base de datos. |
| volumen `uploads` | Los comprobantes (`/data/uploads` dentro del contenedor). |

> **`docker compose down -v` borra los dos volúmenes** — todas las deudas y todos los
> comprobantes. `docker compose down` a secas los conserva. Respalda antes de experimentar:
> `scripts/backup.sh --compose` ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).

Comandos útiles:

```bash
docker compose logs -f app         # arranque, migraciones, errores
docker compose ps                  # «healthy» cuando /api/health responde
docker compose stop                # detener, conservando todo
```

## 2. La configuración que importa

Toda está en [`.env.example`](../../.env.example), con comentarios. Lo mínimo:

| Variable | |
|---|---|
| `APP_URL` | La dirección que la gente escribe, **incluida la ruta base**, sin diagonal final: `https://debt.example.org` o `https://example.org/debt`. |
| `NEXT_PUBLIC_BASE_PATH` | La parte de ruta de `APP_URL` (`/` para la raíz). **Se lee al compilar**: ver la sección siguiente. |
| `AUTH_SECRET` | La genera `setup.sh`. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Tu cliente OAuth de Google. Registra `<APP_URL>/api/auth/callback/google` como URI de redirección. |
| `DATA_ENCRYPTION_KEY` | La genera `setup.sh`. **Respáldala**: sin ella no se pueden leer los datos bancarios guardados. |
| `POSTGRES_PASSWORD` | La genera `setup.sh` para la base de datos incluida. |

Los cambios en `.env` surten efecto con `docker compose up -d` (recrea el contenedor), salvo las
dos variables que se leen al compilar.

## 3. En la raíz de un dominio o bajo una ruta

La ruta base queda compilada dentro de la app. Cambiarla significa **construir de nuevo**:

```bash
# https://debt.example.org  → en la raíz
NEXT_PUBLIC_BASE_PATH=/        APP_URL=https://debt.example.org

# https://example.org/debt  → bajo una ruta (lo predeterminado)
NEXT_PUBLIC_BASE_PATH=/debt    APP_URL=https://example.org/debt
```

Define ambas en `.env` y después:

```bash
docker compose up -d --build
```

`MAX_UPLOAD_MB` es la otra variable que se lee al compilar.

Las dos variantes se verificaron con la imagen: una construida para `/debt` responde bajo
`/debt` (y redirige `/` hacia allí); una construida para `/` responde en la raíz.

## 4. HTTPS y un proxy inverso

No expongas el puerto 3000 directamente a internet. Pon delante un proxy inverso que termine
HTTPS y reenvíe a la app. Sea cual sea, debe:

1. **no recortar la ruta** — con una construcción para `/debt`, la app espera recibir `/debt/…`;
2. pasar el **host** público (`Host` y/o `X-Forwarded-Host`);
3. pasar el **esquema** público (`X-Forwarded-Proto: https`);
4. añadir la dirección del visitante a `X-Forwarded-For`.

La app usa el host para aceptar envíos de formularios solo desde sus propias páginas, el esquema
junto con `APP_URL` para marcar las cookies como `Secure`, y la dirección para los límites de uso.

Cuando el proxy esté en la misma máquina, pon `APP_BIND=127.0.0.1` en `.env` y ejecuta
`docker compose up -d`: la app solo escuchará en la interfaz local.

### Caddy (HTTPS automático)

Archivo listo para editar: [`deploy/caddy/Caddyfile.standalone.example`](../../deploy/caddy/Caddyfile.standalone.example).

```caddy
# En la raíz de un (sub)dominio — construye con NEXT_PUBLIC_BASE_PATH=/
debt.example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

```caddy
# Bajo una ruta de un sitio que sirve otras cosas — construye con NEXT_PUBLIC_BASE_PATH=/debt
example.org {
	@debt path /debt /debt/*
	handle @debt {
		reverse_proxy 127.0.0.1:3000
	}
	handle {
		# …el resto de tu sitio…
	}
}
```

Caddy envía por sí solo `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto` y `X-Forwarded-For`.
(Solo cuando otra cosa termina el TLS *antes* de Caddy — como en Railway — hace falta
`header_up X-Forwarded-Proto https`; ver [`deploy/caddy/debt.caddy`](../../deploy/caddy/debt.caddy).)

### nginx

Fragmentos: [`deploy/nginx/debt.conf`](../../deploy/nginx/debt.conf) y
[`deploy/nginx/debt-proxy.conf`](../../deploy/nginx/debt-proxy.conf). Dentro de tu bloque
`server { … }` con HTTPS:

```nginx
location = /debt  { proxy_pass http://127.0.0.1:3000; include snippets/symmetry-debt-proxy.conf; }
location /debt/   { proxy_pass http://127.0.0.1:3000; include snippets/symmetry-debt-proxy.conf; }
```

y, en `snippets/symmetry-debt-proxy.conf`:

```nginx
proxy_http_version 1.1;
proxy_set_header Host              $host;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_buffering off;            # las páginas se envían conforme se generan
client_max_body_size 12m;       # MAX_UPLOAD_MB más un margen
```

Escribe `proxy_pass` **sin** ruta después del puerto, para que la ruta de la petición pase tal
cual.

Ambos fragmentos se comprobaron contra un contenedor en marcha: `/debt` llega a la app,
`/debtors` no, y nginx rechaza las subidas que superan el límite.

### Más de un proxy delante

`TRUSTED_PROXY_HOPS` (1 por omisión) es el número de proxies que añaden a `X-Forwarded-For`. Con
una CDN delante de tu proxy suele ser `2` — siempre que tu proxy esté configurado para conservar
la entrada de la CDN en lugar de sobrescribirla.

## 5. Comprobaciones

```bash
curl -s https://example.org/debt/api/health            # {"status":"ok"}  (503 si la base de datos no responde)
curl -s https://example.org/debt/api/auth/providers     # «callbackUrl» debe ser exactamente lo que registraste en Google
```

Si el inicio de sesión regresa con un error, nueve de cada diez veces `APP_URL` no coincide con
la dirección del navegador, o el proxy no está pasando el host o el esquema.

## 6. Correo, comprobantes y recordatorios

- **El correo** es opcional. `EMAIL_PROVIDER=smtp` con `SMTP_URL`, o `EMAIL_PROVIDER=resend` con
  `RESEND_API_KEY`. Sin él, las personas ven sus avisos dentro de la app y los enlaces de
  invitación se comparten a mano.
- **Los comprobantes** se guardan en el volumen `uploads`. Para usar un bucket compatible con S3,
  define `STORAGE_DRIVER=s3` y las variables `S3_*`. El bucket debe ser privado.
- **Los recordatorios** corren dentro del servidor cada hora; no hay nada que programar. Un
  programador externo también puede llamar a `POST <APP_URL>/api/cron/reminders` con
  `Authorization: Bearer $CRON_SECRET` — el trabajo nunca repite un recordatorio.

## 7. Actualizar

```bash
scripts/backup.sh --compose        # siempre antes de actualizar
git pull
docker compose up -d --build
docker compose logs -f app         # observa las migraciones
```

Las migraciones se aplican cuando arranca el contenedor. Si una falla, el servidor **no**
arranca; el log dice por qué. Ver «Falló una migración» en
[BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).

Si prefieres ejecutar las migraciones tú: define `SKIP_MIGRATIONS=true` en el contenedor y corre
`docker compose run --rm app prisma migrate deploy` cuando lo decidas.

## 8. Más de una instancia

Un solo contenedor sobra para uso personal. Si aun así escalas:

- corre la **misma imagen** en todas las instancias;
- guarda los comprobantes en un bucket (`STORAGE_DRIVER=s3`), no en un disco local;
- no hace falta nada más: las sesiones y los límites de uso viven en PostgreSQL, y los
  recordatorios se deduplican en la base de datos.

## 9. Sin Docker

Necesitas Node.js 24 (funciona desde la 22) y una base de datos PostgreSQL — el proyecto se
prueba con PostgreSQL 17.

```bash
npm ci
NEXT_PUBLIC_BASE_PATH=/debt npm run build
npm run db:deploy                  # aplica las migraciones
npm start                          # http://localhost:3000/debt
```

`npm start` ejecuta `scripts/start-standalone.mjs`: copia los archivos estáticos junto al
servidor autocontenido que la compilación deja en `.next/standalone`, carga `.env` (con
`SKIP_ENV_FILES=1` usa solo el entorno real) y lo arranca. Respeta `PORT` y `HOSTNAME`. No se usa
`next start`, porque la app se compila en modo standalone.

Córrelo bajo un gestor de procesos (systemd, pm2…) y detrás de un proxy inverso, como en la
sección 4.
