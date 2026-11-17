# Modelo de seguridad

*[English version](../en/SECURITY_MODEL.md)*

Un resumen de qué protege Symmetry Debt, frente a qué y cómo. Para reportar un problema, ver
[SECURITY.md](../../SECURITY.md). Para qué se guarda y por cuánto tiempo, ver
[DATA_AND_PRIVACY.md](DATA_AND_PRIVACY.md).

## Qué se protege

1. **La privacidad** — los registros personales, contactos, cuentas bancarias y comprobantes de
   una persona son solo suyos; un acuerdo compartido lo ven sus dos participantes y nadie más.
2. **El significado de «confirmado»** — nada cuenta como acordado por ambas partes si ambas
   partes no acordaron exactamente eso.
3. **El historial** — lo que se confirmó no se puede cambiar después sin que se note.
4. **La exactitud** — los importes nunca se aproximan.

## Frente a quién se defiende la app

| Alguien que… | …no debe poder |
|---|---|
| no ha iniciado sesión | ver nada más que la página pública de inicio |
| tiene sesión pero no forma parte de una deuda | verla, modificarla ni saber que existe |
| conoce el correo de otra persona | saber si tiene cuenta, leer algo suyo o apropiarse de un registro privado que la menciona |
| tiene un enlace para compartir que no le corresponde | hacer más que leer esa propuesta; no puede hacerla entrar en vigor sin que quien propuso la reconozca |
| es una de las dos partes | confirmar sus propios movimientos, aceptar su propia propuesta, editar el historial confirmado, ni ver las notas privadas, los contactos o las cuentas bancarias no compartidas de la otra |
| obtiene una copia de la base de datos | usarla para entrar como otra persona (las sesiones van con hash) ni leer datos bancarios (cifrados) |
| envía la misma petición dos veces, o dos a la vez | crear duplicados ni confirmar más de lo que se debe |

Fuera del alcance del software: quien opera el servidor puede leer la base de datos. Si eso te
importa, corre tu propia instalación.

## Controles

### Identidad

- Solo inicio de sesión con Google (OpenID Connect con PKCE, state y nonce). Solo se aceptan
  correos **verificados por Google**.
- Los usuarios se identifican por un id interno. Un correo nunca se trata como prueba de nada.
- Las sesiones viven en la base de datos; el token de la cookie se guarda **con hash**. Cerrar
  sesión, o «cerrar sesión en todos lados», las termina del lado del servidor. Las cookies son
  `HttpOnly`, `SameSite=Lax`, `Secure` sobre HTTPS y están limitadas a la ruta base de la app.
- Los tokens de Google no se guardan.
- El retorno de OAuth nunca añade una identidad nueva de Google a una sesión que ya está abierta
  en el navegador, así que dos personas que comparten computadora no pueden acabar fusionadas en
  una sola cuenta.
- Se rechaza una cuenta de Google distinta con el mismo correo que una cuenta existente. Las
  únicas filas que un inicio de sesión verificado puede adoptar son las que nadie demostró nunca
  que fueran suyas: creadas por un script de importación, o con identidades solo del emisor
  simulado local.

### Autorización

- Se aplica en el servidor, dentro de los servicios que tocan los datos — nunca solo en la
  interfaz. Todo servicio recibe de forma explícita a la persona que actúa.
- Una sola regla para las deudas: un registro personal → su titular; un acuerdo compartido →
  sus dos participantes. A cualquier otra cosa se responde «no encontrado».
- Las listas, los totales, la actividad y las exportaciones se construyen para quien mira, con
  lo que esa persona puede ver.
- Las entradas del historial de un acuerdo que conciernen a una sola parte (a quién iba dirigido
  un enlace, a quién se retiró) se muestran solo a esa parte.

### La regla bilateral

- Proponer condiciones deja registrada la aceptación de quien propone; solo la **otra** parte
  puede aceptar. Cada respuesta lleva el hash de las condiciones que estaban en pantalla, y se
  rechaza si cambiaron.
- Quien registra un movimiento no puede confirmarlo. Solo los movimientos confirmados cambian el
  saldo confirmado.
- Un acuerdo entra en vigor solo cuando ambas partes aceptaron la misma versión **y** quien
  propuso sabe quién se unió: automáticamente si la invitación nombraba el correo verificado de
  quien se une; si no, después de que quien propuso lo confirme.
- Un comprobante nunca confirma nada.

### Integridad

- Los saldos se calculan a partir de los movimientos; nunca se guardan.
- Todo cambio sobre una deuda corre en una transacción que primero bloquea la fila de la deuda;
  crear cosas requiere una clave de idempotencia.
- Los movimientos confirmados, las condiciones aceptadas, las aprobaciones y la auditoría son
  inmutables **a nivel de base de datos** (disparadores `SD001`–`SD009`), además de las
  restricciones `CHECK` que mantienen separadas las dos modalidades. Ver
  [ARCHITECTURE.md](ARCHITECTURE.md#10-lo-que-la-propia-base-de-datos-rechaza).

### Datos bancarios

- Se cifran con AES-256-GCM antes de llegar a la base de datos; un valor manipulado no se puede
  descifrar.
- Solo se muestran a otra persona por decisión explícita de su titular, por acuerdo y revocable.
- Los pagos conservan una etiqueta enmascarada («BBVA •••• 1234»), no el número.
- No existe ningún campo para contraseñas, NIP ni datos de tarjeta.

### Archivos

- Solo PDF, JPG, PNG y WebP, reconocidos por sus primeros bytes; con límite de tamaño.
- Se guardan con nombres aleatorios en almacenamiento privado; solo se sirven por una ruta
  autorizada, con `nosniff` y sin caché en intermediarios.

### La superficie web

- **Content-Security-Policy** con un nonce por petición: los scripts solo corren desde el propio
  origen de la app y solo con ese nonce; no se permite incrustar la app en marcos; los
  formularios solo pueden enviarse a la app o al proveedor de identidad.
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, una `Referrer-Policy` estricta y
  una `Permissions-Policy` restrictiva.
- Las peticiones que cambian estado son server actions, que Next.js solo acepta desde el propio
  origen de la app; el punto de subida de archivos comprueba el origen por su cuenta.
- Las redirecciones después de iniciar sesión solo van a rutas dentro de la app.
- Sin scripts, fuentes, analítica ni rastreadores de terceros.

### Abuso

- Límites de uso guardados en PostgreSQL (así valen entre instancias): cambios por cuenta,
  invitaciones, apertura de enlaces de invitación, subidas, exportaciones e intentos de inicio
  de sesión por dirección.
- Enlaces de invitación: tokens aleatorios de 256 bits, guardados con hash, de un solo uso, con
  vencimiento y revocables.
- Los correos de invitación no llevan ningún detalle de la deuda.

### Secretos y configuración

- Todo lo secreto viene del entorno; nada está en el repositorio. `.env` está ignorado por git y
  excluido de las imágenes de Docker.
- La configuración se valida al arrancar y los problemas se informan por nombre.
- El emisor simulado de inicio de sesión existe para desarrollo; el servidor avisa con claridad
  si está configurado en producción.

## Lo que te toca como operador

- Sirve la app por **HTTPS**, detrás de un proxy inverso que pase el host y el esquema públicos
  ([SELF_HOSTING.md](SELF_HOSTING.md)).
- Mantén privados el `.env`, la base de datos y los respaldos. Respalda `DATA_ENCRYPTION_KEY`
  aparte.
- Nunca definas `AUTH_GOOGLE_ISSUER` fuera de desarrollo.
- Si los comprobantes están en un bucket, mantenlo privado.
- Mantén al día la app y su imagen base.

## Límites conocidos

- Quien opera una instalación puede leer sus datos (salvo los datos bancarios, mientras la clave
  se guarde separada de la base de datos).
- Detrás de un proxy que oculta la dirección del visitante, el límite de inicio de sesión por
  dirección queda compartido entre todos
  ([DEPLOY_RAILWAY.md](DEPLOY_RAILWAY.md#la-dirección-del-visitante-y-los-límites-de-uso)).
- No hay un segundo factor más allá del que tenga la cuenta de Google de la persona.
- Al rotar la clave de cifrado, los valores se vuelven a cifrar poco a poco, cuando cada cuenta
  bancaria se guarda de nuevo.
