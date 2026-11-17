# Datos y privacidad

*[English version](../en/DATA_AND_PRIVACY.md)*

Qué guarda una instalación de Symmetry Debt, quién puede verlo, cuánto tiempo se conserva y cómo
se elimina. Esto describe el software; quien opera una instalación es responsable de ella y de
las obligaciones legales que apliquen en su lugar.

## Quién puede ver qué

| Dato | Quién puede verlo |
|---|---|
| Un **registro personal** (la deuda, sus pagos, notas, comprobantes, historial) | Solo la persona que lo creó. La contraparte que aparece en él no puede — aunque tenga cuenta, y aunque coincidan su nombre o su correo. |
| Un **acuerdo compartido** (condiciones, versiones, movimientos, notas compartidas, comprobantes, historial) | Solo sus dos participantes. |
| Una **propuesta** aún sin responder | Quien la propuso y quien abra su enlace después de iniciar sesión. Ve las condiciones propuestas, los comprobantes que quien propuso decidió adjuntar a la propuesta, y el nombre y correo de quien propone — nada más de esa persona. |
| **Contactos** | Solo su titular. |
| **Cuentas bancarias** | Solo su titular. La otra parte de un acuerdo ve el banco, el nombre del titular y la CLABE / número de cuenta **solo** si su titular compartió expresamente esa cuenta para ese acuerdo, y solo una vez que el acuerdo entró en vigor — nunca con una simple propuesta, ni después de cancelado. Se puede dejar de compartir en cualquier momento. |
| Notas privadas en un acuerdo compartido | Solo quien las escribió. |
| Notificaciones | Solo quien las recibe. |

Conocer el correo de alguien nunca revela si usa la app ni da acceso a nada suyo.

## Qué se guarda

**Sobre cada persona**

- De Google, al iniciar sesión: nombre, correo (verificado por Google) y URL de la foto de
  perfil. Los tokens de acceso y de refresco de Google **no** se guardan; la app no puede actuar
  sobre la cuenta de Google de nadie.
- Preferencias: idioma, zona horaria, moneda predeterminada, qué recordatorios y correos quiere.
- Sesiones: una fila por navegador con sesión, con un **hash** del token de sesión y su fecha de
  vencimiento.

**Lo que la persona captura**

- Contactos: nombre y, opcionalmente, correo, teléfono y notas.
- Deudas y acuerdos: concepto, importes, fechas, calendario, método de pago previsto, notas.
- Movimientos: importe, fecha, método, referencia, notas; en transferencias, el banco de origen,
  una descripción enmascarada de la cuenta de destino y la clave de rastreo; en efectivo, el
  lugar.
- Cuentas bancarias: alias, banco, nombre del titular, CLABE y/o número de cuenta, moneda.
- Comprobantes: los archivos que sube (PDF, JPG, PNG, WebP).

**Lo que la app escribe por su cuenta**

- El historial (auditoría) de cada deuda y de las acciones de la cuenta.
- Notificaciones.
- Invitaciones: un hash del token del enlace, el correo al que iba dirigido (si se indicó) y su
  vencimiento.
- Contadores de límites de uso, por id de cuenta — o por dirección de red en el único límite que
  aplica antes de iniciar sesión. Se borran un día después de terminar su ventana.

**Nunca se guardan:** contraseñas bancarias, NIP, números de tarjeta, CVV ni credenciales
bancarias de ningún tipo. La app no mueve dinero y no tiene dónde ponerlas.

## Cómo se protege

| | |
|---|---|
| Datos bancarios | La CLABE y el número de cuenta se cifran antes de llegar a la base de datos (AES-256-GCM, clave en `DATA_ENCRYPTION_KEY`). Las listas solo muestran los últimos cuatro dígitos. |
| Sesiones | La cookie lleva un token aleatorio; la base de datos, solo su hash SHA-256. Una copia de la base no es un juego de sesiones vivas. |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` sobre HTTPS, y limitadas a la ruta base de la app para que no se envíen a otras aplicaciones del mismo dominio. Las sesiones duran 30 días y se renuevan con el uso. |
| Comprobantes | Se guardan en almacenamiento privado con nombres aleatorios y solo se sirven a través de la app, tras comprobar quién pregunta. Los archivos se identifican por su contenido, no por su nombre. |
| Enlaces de invitación | Tokens aleatorios de 256 bits, guardados con hash, de un solo uso, con vencimiento (14 días por omisión) y revocables. |
| Páginas | Una Content-Security-Policy estricta con nonce por petición; sin scripts, fuentes ni rastreadores de terceros. |
| Historial confirmado | No se puede editar ni borrar — la propia base de datos lo rechaza. |

La app no contiene analítica, publicidad ni rastreadores de terceros, y no envía telemetría a
ningún lado.

## Qué sale de la instalación

- **Google**: el inicio de sesión.
- **Tu proveedor de correo**, si configuraste uno: el aviso o la invitación que se envía y el
  correo del destinatario. Los correos de invitación, a propósito, no dicen nada de la deuda:
  ni concepto ni importes.
- **Tu proveedor S3**, si elegiste `STORAGE_DRIVER=s3`: los archivos de los comprobantes.
- **Plataformas de donación**: nada. Los enlaces son enlaces normales; la app no les envía datos.

## Registros (logs)

El servidor está escrito para no registrar tokens, cookies ni datos bancarios. Los problemas de
inicio de sesión se registran solo con el nombre y el mensaje del error; los errores inesperados
se registran con su mensaje técnico para poder diagnosticarlos. Los proxies inversos y las
plataformas de alojamiento llevan sus propios registros de acceso (direcciones, rutas); los
tokens de invitación aparecen en la ruta de los enlaces de invitación, y esa es una de las
razones por las que son de un solo uso y vencen.

## Exportar

**Configuración → Exportar mis datos** descarga un archivo JSON con todo lo que la app tiene
sobre la persona: perfil y preferencias, contactos, cuentas bancarias (descifradas, porque son
suyas), registros personales con sus movimientos e historial, los acuerdos compartidos en los
que participa *tal como ella los ve*, sus notificaciones y el historial de su cuenta.

Nunca incluye nada que sea solo de la otra persona: sus notas privadas, sus contactos ni sus
cuentas bancarias.

## Eliminar

- **Un registro personal** lo puede eliminar su titular en cualquier momento. Se borran el
  registro, sus movimientos, su historial y sus comprobantes.
- **Un contacto** se puede eliminar mientras nada lo use; si no, se archiva.
- **Una cuenta bancaria** se puede eliminar en cualquier momento; la persona con quien se
  compartió pierde el acceso de inmediato. Los pagos que la mencionan conservan solo la etiqueta
  enmascarada con la que se registraron.
- **Un acuerdo compartido** es de dos personas, así que una sola no puede borrarlo. Se puede
  cancelar (cualquiera de las partes antes de que entre en vigor; de mutuo acuerdo después) y
  permanece en el historial de ambas.

### Eliminar la cuenta

**Configuración → Eliminar mi cuenta** pide escribir el correo y entonces:

- borra lo que es solo de la persona: perfil, sesiones, preferencias, contactos, cuentas
  bancarias, notificaciones y todos sus registros personales con sus comprobantes;
- da por terminados los acuerdos que aún se estaban negociando;
- borra los acuerdos en los que no participa nadie más;
- **conserva** los demás acuerdos compartidos para la otra parte, con el nombre de la persona
  tal como aparecía, pero ya sin vínculo con ninguna cuenta. El registro que la otra persona
  tiene de lo acordado y pagado es suyo.

Se **rechaza mientras haya un acuerdo en vigor con saldo pendiente**: nadie puede desentenderse
de un acuerdo abierto borrando su cuenta. Esos acuerdos hay que liquidarlos o cancelarlos antes.

## Conservación

- Los datos se conservan hasta que la persona los elimina o elimina su cuenta. Nada vence por sí
  solo: una deuda de hace años sigue siendo un registro que alguien puede necesitar.
- Las sesiones vencidas y los contadores viejos de límites de uso se depuran automáticamente.
- Los respaldos son de quien opera: decide cuánto los conservas, y recuerda que restaurar un
  respaldo trae de vuelta datos que se eliminaron después de hacerlo.

## Para quien opera una instalación

- Usa HTTPS, mantén privados el `.env` y los respaldos, y respalda `DATA_ENCRYPTION_KEY` aparte
  ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- Di a las personas que invitas quién opera la instalación. Tú — no quienes escribieron el
  software — eres quien tiene sus datos.
- Prefiere la eliminación de cuenta desde la app. Si alguna vez tienes que retirar a una persona
  a mano, borrar su fila en `User` elimina de la base de datos lo que es solo suyo y la
  desvincula de los acuerdos que queden — pero los archivos de sus comprobantes permanecen en el
  almacenamiento y hay que retirarlos aparte.
