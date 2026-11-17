# Inicio de sesión con Google: cómo crear el cliente OAuth

*[English version](../en/GOOGLE_OAUTH.md)*

Symmetry Debt identifica a las personas con su cuenta de Google y nada más. Le pide a Google lo
mínimo — quién es la persona (`openid`, `email`, `profile`) — y nunca acceso a Gmail, Drive ni
ninguna otra cosa. Los tokens de Google no se guardan.

Necesitas un **cliente OAuth** de Google Cloud. Es gratuito y toma unos diez minutos. El mismo
cliente sirve para tu instalación local y para la pública.

> Google cambia de vez en cuando los nombres de las pantallas de su consola. Los de abajo son
> los vigentes al escribir esto; si alguna etiqueta difiere un poco, busca la misma idea.

## 1. La dirección que vas a registrar

Google solo devuelve a las personas a direcciones registradas de antemano. Para Symmetry Debt
esa dirección es siempre:

```
<APP_URL>/api/auth/callback/google
```

`APP_URL` es la dirección pública de la app, **incluida su ruta base**:

| Instalación | `APP_URL` | URI de redirección que debes registrar |
|---|---|---|
| Local | `http://localhost:3000/debt` | `http://localhost:3000/debt/api/auth/callback/google` |
| Instancia oficial de pruebas | `https://aminoacid.com.mx/debt` | `https://aminoacid.com.mx/debt/api/auth/callback/google` |
| Tu propio dominio, en la raíz | `https://debt.example.org` | `https://debt.example.org/api/auth/callback/google` |

Tiene que coincidir **exactamente**: esquema, host, puerto, ruta, sin diagonal al final.

## 2. Crear el cliente

1. Abre <https://console.cloud.google.com/> y crea un proyecto (o elige uno), p. ej. «Symmetry Debt».
2. Ve a **APIs y servicios → Pantalla de consentimiento de OAuth** (en las consolas nuevas
   aparece como **Google Auth Platform**) y llena lo básico:
   - **Nombre de la app**: lo que verá la gente al iniciar sesión, p. ej. «Symmetry Debt».
   - **Correo de asistencia**: el tuyo.
   - **Público / Tipo de usuario**: **Externo** (cualquier cuenta de Google), salvo que todas las
     personas que la usarán pertenezcan a tu propio Google Workspace.
   - **Información de contacto**: tu correo.
3. **Permisos / Acceso a los datos**: no hace falta añadir nada. La app solo usa `openid`,
   `email` y `profile`, que no son sensibles y no requieren revisión de Google.
4. Ve a **Credenciales → Crear credenciales → ID de cliente de OAuth** (o **Clientes → Crear
   cliente**):
   - **Tipo de aplicación**: **Aplicación web**.
   - **Nombre**: el que quieras, p. ej. «Symmetry Debt web».
   - **Orígenes autorizados de JavaScript**: el origen de cada instalación, sin ninguna ruta:
     - `http://localhost:3000`
     - `https://aminoacid.com.mx`
   - **URI de redirección autorizados**: uno por instalación, de la tabla de arriba:
     - `http://localhost:3000/debt/api/auth/callback/google`
     - `https://aminoacid.com.mx/debt/api/auth/callback/google`
5. Pulsa **Crear**. Google muestra un **ID de cliente** y un **Secreto del cliente**.

## 3. Poner los valores en la app

En `.env` (en local) o en las variables de tu proveedor (Railway, tu servidor…):

```bash
AUTH_GOOGLE_ID=1234567890-abc…apps.googleusercontent.com
AUTH_GOOGLE_SECRET=GOCSPX-…
```

Comprueba también que `APP_URL` sea correcta y que `AUTH_SECRET` esté definida
(`./scripts/setup.sh` la genera). Deja `AUTH_GOOGLE_ISSUER` **sin definir**: solo existe para
sustituir a Google por un simulador en la máquina de quien desarrolla.

Reinicia la app. Estos valores no requieren recompilar.

## 4. Quién puede iniciar sesión: «Prueba» o «En producción»

Una pantalla de consentimiento nueva empieza en modo **Prueba**. En ese estado solo pueden
entrar las cuentas de Google que añadas como **usuarios de prueba** (hasta 100); a las demás
Google las rechaza.

- Para probar la app tú, o con unas pocas personas: añade sus correos en **Público → Usuarios de
  prueba**.
- Para que pueda entrar cualquiera que tenga el enlace — por ejemplo la persona a la que invitas
  a confirmar un acuerdo — pulsa **Publicar app** para pasarla a **En producción**. Como la app
  solo pide los permisos básicos, no sensibles, esto no requiere el proceso de verificación de
  Google.

## 5. Comprobarlo

Abre la app, pulsa **Iniciar sesión con Google** y completa el flujo. Si Google muestra un error:

| Mensaje | Causa |
|---|---|
| `redirect_uri_mismatch` | La URI de redirección que envió la app no está registrada. Compárala carácter por carácter con la sección 1: la ruta base (`/debt`), `http` o `https`, el puerto, una diagonal final. Se construye a partir de `APP_URL`. |
| `Acceso bloqueado: … no completó el proceso de verificación de Google` / `access_denied` | La pantalla de consentimiento está en *Prueba* y esta cuenta no es usuaria de prueba (sección 4). |
| `invalid_client` | `AUTH_GOOGLE_ID` o `AUTH_GOOGLE_SECRET` incorrectos, o con espacios o comillas de más. |
| La app dice «no se pudo iniciar sesión» después de Google | Casi siempre `APP_URL` no coincide con la dirección del navegador, o un proxy inverso no está pasando el host y el esquema (ver [SELF_HOSTING.md](SELF_HOSTING.md)). |

Puedes ver la URI de redirección exacta que usará la app en
`<APP_URL>/api/auth/providers` (campo `callbackUrl`).

## Desarrollo local sin Google

Nada de esto es necesario para trabajar en el código:

```bash
./scripts/setup.sh --mock-auth     # escribe en .env los tres valores del simulador
npm run dev:auth-mock              # arranca el emisor simulado en http://localhost:4455
npm run dev
```

El emisor simulado muestra un pequeño formulario en lugar del selector de cuentas de Google y
acepta cualquier correo que escribas. Existe **solo** para desarrollo y pruebas automáticas:
nunca apuntes hacia él una instalación real.

Las cuentas creadas con el simulador quedan marcadas como tales (su identidad empieza con
`mock-`). Si más adelante llevas esa base de datos a una instalación con inicio de sesión real
de Google, la primera vez que entre quien de verdad es titular de cada correo, la cuenta pasa a
ser suya y la identidad simulada se descarta — ver [LOCAL_TO_CLOUD.md](LOCAL_TO_CLOUD.md).
