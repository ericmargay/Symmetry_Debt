# Respaldo y recuperación

*[English version](../en/BACKUP_AND_RECOVERY.md)*

Los datos de una instalación son tres cosas. Un respaldo al que le falte una está incompleto.

| Qué | Dónde vive | Sin ello |
|---|---|---|
| **La base de datos** | PostgreSQL | Se pierde todo: deudas, pagos, acuerdos, historial. |
| **Los comprobantes** | `STORAGE_LOCAL_DIR` (un directorio o volumen de Docker) o un bucket S3 | Los registros sobreviven; los archivos adjuntos no. |
| **`DATA_ENCRYPTION_KEY`** | Tu `.env` / las variables de tu proveedor | Los datos bancarios guardados (CLABE, números de cuenta) no se podrán leer nunca más. |

Guarda también una copia de todo el `.env`: `AUTH_SECRET`, el cliente de Google y lo demás se
restauran más rápido de lo que se recrean.

## Respaldar la base de datos

[`scripts/backup.sh`](../../scripts/backup.sh) escribe un solo archivo en el formato «custom» de
PostgreSQL. No necesitas herramientas de PostgreSQL en tu máquina: usa las que están dentro del
contenedor de la base de datos, o un contenedor desechable de la misma versión que el servidor.

```bash
scripts/backup.sh --dev                     # la base de desarrollo (docker-compose.dev.yml)
scripts/backup.sh --compose                 # la instalación propia (docker-compose.yml)
scripts/backup.sh --url "postgresql://…"    # cualquier PostgreSQL alcanzable, p. ej. Railway
```

El archivo queda en `backups/` (ignorado por git) como `symmetry-debt-<origen>-<fecha>.dump`,
legible solo por ti. Opciones: `--output ARCHIVO`, `--database NOMBRE` (con `--dev`/`--compose`)
y `--uploads DIR` para archivar además un directorio de comprobantes.

Para **Railway**, usa la URL de conexión *pública* del servicio PostgreSQL (su variable
`DATABASE_PUBLIC_URL`, en el panel, pestaña *Variables*):

```bash
scripts/backup.sh --url "postgresql://postgres:…@….proxy.rlwy.net:12345/railway"
```

> Un respaldo lo contiene todo, en claro, salvo los datos bancarios (que siguen cifrados).
> Trátalo como a la propia base de datos: guárdalo en un lugar privado y, si sale de tu máquina,
> cífralo antes — por ejemplo `gpg --symmetric backups/archivo.dump`.

### Hacerlo con regularidad

Basta una entrada de cron en el servidor:

```cron
# cada noche a las 03:15, conservando 30 días
15 3 * * *  cd /srv/Symmetry_Debt && scripts/backup.sh --compose >> backups/backup.log 2>&1 && find backups -name '*.dump' -mtime +30 -delete
```

Copia los archivos a otra máquina o a almacenamiento de objetos: un respaldo que vive en el mismo
disco que la base de datos protege de errores, no de perder el disco.

## Respaldar los comprobantes

| Dónde están | Cómo |
|---|---|
| Un directorio (desarrollo: `./.data/uploads`) | `scripts/backup.sh --dev --uploads ./.data/uploads`, o simplemente copia el directorio. |
| El volumen `uploads` de Compose | `docker run --rm -v symmetry-debt_uploads:/data:ro -v "$PWD/backups:/backup" alpine tar -czf "/backup/uploads-$(date +%F).tar.gz" -C /data .` |
| Un volumen de Railway | `railway volume files download /uploads ./uploads-backup` (comprueba antes la ruta con `railway volume files list /`), o programa respaldos del volumen en su configuración. |
| Un bucket S3 | Las herramientas de tu proveedor (`aws s3 sync`, `rclone`…) o el versionado del bucket. |

Los nombres de archivo en el almacenamiento son aleatorios; la base de datos sabe qué archivo
corresponde a qué comprobante. Respalda siempre la base de datos y los comprobantes **del mismo
momento**.

## Restaurar

[`scripts/restore.sh`](../../scripts/restore.sh) vuelca un respaldo **dentro** de una base de
datos, reemplazando lo que haya. Corre como una sola transacción: si algo falla, nada cambia.

```bash
docker compose stop app                              # que nada esté escribiendo mientras tanto

scripts/restore.sh backups/ARCHIVO.dump --compose    # en la instalación propia
scripts/restore.sh backups/ARCHIVO.dump --dev        # en la base de desarrollo
scripts/restore.sh backups/ARCHIVO.dump --url "postgresql://…"

docker compose start app                             # aplica migraciones más nuevas, si las hay
```

Muestra dónde va a restaurar y pide que escribas `restore` (en scripts usa `--yes`). Con
`--database NOMBRE` (con `--dev`/`--compose`) restaura en otra base de datos, creándola si hace
falta.

Después, las dos cosas que no están en la base de datos:

1. **`DATA_ENCRYPTION_KEY`** debe ser el valor que estaba en uso cuando se hizo el respaldo.
2. **Comprobantes**: devuelve los archivos a donde apunte `STORAGE_LOCAL_DIR` (o al bucket).
   Para el volumen de Compose:
   `docker run --rm -v symmetry-debt_uploads:/data -v "$PWD/backups:/backup:ro" alpine tar -xzf /backup/uploads-FECHA.tar.gz -C /data`

La app corrige por sí sola el propietario de los archivos restaurados la próxima vez que arranca
el contenedor.

### Comprueba tus respaldos

Un respaldo vale lo que su última restauración exitosa. Esto restaura en una base de datos de
prueba sin tocar la real:

```bash
scripts/restore.sh backups/ARCHIVO.dump --dev --database restore_check --yes
```

Los scripts se verificaron así: se respaldó una base con datos, se restauró en una vacía y se
compararon tabla por tabla (contenido idéntico), junto con sus restricciones, índices y
disparadores — que después de restaurar siguen rechazando lo que deben.

## Recuperar en un servidor nuevo

1. Instala la app como siempre ([SELF_HOSTING.md](SELF_HOSTING.md) o
   [DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md)), con la **misma** `DATA_ENCRYPTION_KEY`.
2. Restaura en ella la base de datos.
3. Copia los comprobantes.
4. Si cambió la dirección, actualiza `APP_URL` y añade la nueva URI de redirección al cliente de
   Google.
5. Arranca la app y comprueba `<APP_URL>/api/health`.

Las personas entran con Google como antes: sus cuentas están en la base de datos que restauraste.

## La clave de cifrado

`DATA_ENCRYPTION_KEY` cifra las CLABE y los números de cuenta antes de que lleguen a la base de
datos (AES-256-GCM). La app no la guarda en ningún lado.

- **Si la pierdes**, esos valores son irrecuperables. Todo lo demás sigue funcionando; las
  personas tendrían que volver a capturar sus cuentas bancarias.
- **Si se filtra**, rótala.

### Rotar la clave

1. Genera una clave nueva: `openssl rand -base64 32`.
2. Pon en `DATA_ENCRYPTION_KEY_PREVIOUS` el valor **anterior** y en `DATA_ENCRYPTION_KEY` el
   **nuevo**. Reinicia la app.
3. A partir de ahí todo se escribe con la clave nueva, y lo escrito con la anterior se sigue
   pudiendo leer.
4. Un valor guardado se vuelve a cifrar con la clave nueva cuando su cuenta bancaria se guarda
   otra vez. Todavía no hay un comando para recifrar todo de golpe, así que conserva
   `DATA_ENCRYPTION_KEY_PREVIOUS` hasta que todas las cuentas se hayan guardado de nuevo (o
   vuelto a capturar).

Solo se admite una clave anterior a la vez.

## Falló una migración

Al arrancar, el contenedor aplica las migraciones pendientes y **no inicia el servidor si
fallan**; el log muestra el error de PostgreSQL. La versión nueva no atiende nada, así que no se
escriben datos sobre un esquema a medio migrar.

Qué hacer:

1. Lee el error (`docker compose logs app`, o `railway logs`).
2. El camino rápido de regreso: vuelve a la versión anterior de la app y, si el esquema llegó a
   cambiar, restaura el respaldo que sacaste antes de actualizar.
3. Para inspeccionar o reparar a mano, ejecuta la CLI de Prisma dentro de la imagen sin iniciar
   el servidor:

   ```bash
   docker compose run --rm -e SKIP_MIGRATIONS=true app prisma migrate status
   docker compose run --rm -e SKIP_MIGRATIONS=true app prisma migrate resolve --rolled-back NOMBRE
   ```

   y vuelve a arrancar la app cuando la causa esté corregida.

Una base de datos que simplemente tarda en levantar no es una falla: el contenedor reintenta un
rato antes de rendirse (`MIGRATION_ATTEMPTS`, 10 por omisión).
