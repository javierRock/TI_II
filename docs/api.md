# API del primer avance de préstamos directos

Prefijo: `/api/v1`. Solicitudes y respuestas JSON. Los identificadores `bigint`
son **cadenas**, nunca números JavaScript. Listados: `{datos, total, pagina, limite}`;
`pagina=1`, `limite=25` por defecto, máximo 100 elementos. Campos desconocidos se rechazan.

## Sesiones

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/health` | Público |
| POST | `/auth/login` | Público, con límite de intentos |
| GET | `/auth/me` | Cuenta activa con sesión vigente |
| POST | `/auth/logout` | Sesión + CSRF |

Login:

```json
{"nombre_usuario":"usuario_autorizado","password":"<tu_contraseña>"}
```

Respuesta: `{usuario, csrf_token, expira_en}` y cookie `prestamos_session`.
La cookie es HttpOnly, SameSite=Lax, con ruta `/api/v1`; en producción también
Secure. El servidor almacena solo SHA-256 del token aleatorio de 256 bits.
Una nueva autenticación desde una cookie existente revoca la sesión anterior.

`me` devuelve exclusivamente la identidad de la sesión y permite recuperar el
token CSRF tras recargar la página. Para **todas las escrituras autenticadas**:

```text
Content-Type: application/json
X-CSRF-Token: <csrf_token obtenido de login o me>
Cookie: prestamos_session=<cookie gestionada por el navegador>
```

El token CSRF se deriva de la sesión y se compara en tiempo constante. No usar
`localStorage` para el secreto de sesión. Logout envía un cuerpo JSON vacío `{}`
y responde 204, revocando la sesión y borrando la cookie. Sesiones expiradas,
revocadas o de personas/cuentas inactivas responden 401.

`APP_ORIGIN` define el origen web autorizado. Un Origin ajeno o Fetch Metadata
cross-site se rechaza. No se habilita CORS. El login no acepta formularios HTML
simples: requiere JSON y la comprobación de origen. En producción APP_ORIGIN
requiere HTTPS, mediante un proxy TLS frente al servidor en loopback.

## Personas, cuentas y perfiles

Todas estas rutas requieren **atribución administrativa**, no basta el rol base.

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | `/personas?q=&pagina=&limite=` | Listar personas |
| GET | `/personas/:id` | Persona, cuenta y perfiles; sin hashes |
| POST | `/personas` | Registrar persona sin cuenta |
| PATCH | `/personas/:id` | Corregir nombre/correo/contacto |
| PATCH | `/personas/:id/estado` | `{activo: boolean}` |
| POST | `/personas/:id/cuenta` | Crear cuenta y perfil atómicamente |
| PATCH | `/personas/:id/cuenta` | Cambiar estado o rol validando el perfil |
| PUT | `/personas/:id/perfil` | Crear/actualizar perfil por tipo |

Persona:

```json
{
  "documento":"<documento real>",
  "nombre_completo":"<nombre real>",
  "correo":"<correo válido>",
  "contacto":null
}
```

Cuenta estudiante:

```json
{
  "nombre_usuario":"estudiante_autorizado",
  "password":"<contraseña de 12 a 128 caracteres>",
  "rol":"estudiante",
  "perfil":{
    "tipo":"estudiante","codigo":"<código real>","habilitado":true,
    "plan_id":"<id del plan>","semestre":1
  }
}
```

Cuenta docente: `rol=docente`, perfil con `tipo=docente`, `codigo`, `habilitado`,
`especialidad` y `vinculacion`. Cuenta `personal_administrativo`: sin perfil.
El semestre debe estar registrado en un plan activo. Un perfil habilitado
requiere una validación institucional real: no establecerlo automáticamente.

No hay auto-registro, cambio de documento o reasignación de cuenta a otra persona.
No se acepta `atribucion_admin` en las solicitudes: la delegación institucional
de permisos se implementará por separado. El rol administrativo por sí solo no
concede privilegios. Cambios de rol/atribución/contraseña revocan sesiones; el perfil
anterior y las condiciones originales de préstamos siguen conservados.

Desactivar una persona desactiva su cuenta, sin eliminar operaciones. Reactivar
la persona no reactiva automáticamente la cuenta. No se impide desactivar la propia
cuenta: supone perder acceso y puede requerir recuperación por un responsable de
base de datos con autorización institucional. El bootstrap no es un reset de cuentas.

## Planes académicos

- GET `/planes-estudio`: autenticado, filtros `q`, `pagina`, `limite`.
- POST `/planes-estudio`: administrador + CSRF.

Cuerpo: `{codigo, programa, nombre, semestres:[1,2,...]}`. Los semestres deben
ser positivos, únicos y compatibles con `smallint`; no se impone un máximo de 12.

## Catálogo para cuentas autenticadas

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/catalogo/tipos` | Cinco categorías permitidas |
| GET | `/catalogo/bienes` | Fichas, filtros `q`, `tipo`, paginación |
| GET | `/catalogo/bienes/:id` | Características de una ficha |
| GET | `/catalogo/unidades` | Disponibilidad actual sin titulares ni observaciones privadas |

Unidades admite `q`, `tipo`, `disponible=true|false`, `pagina`, `limite`.
`tipo` usa `libro`, `mesa_ping_pong`, `visor_3d`, `parlante` o `carrito_robotica`.
No se admiten filtros temporales todavía: disponibilidad futura requiere reservas.
Las búsquedas escapan `%`, `_` y `\`; todo el SQL usa parámetros.

## Administración del inventario

Todas requieren administrador; las escrituras también CSRF.

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | `/inventario/unidades/:id` | Detalle administrativo de unidad |
| POST | `/inventario/bienes` | Crear ficha |
| PATCH | `/inventario/bienes/:id` | Editar ficha sin reclasificar su tipo |
| POST | `/inventario/unidades` | Registrar unidad física |
| PATCH | `/inventario/unidades/:id` | Ubicación, condición, accesorios, adquisición y observaciones |
| PATCH | `/inventario/unidades/:id/estado` | Disponible/mantenimiento/baja |

Ficha: `{tipo_id, nombre, descripcion?, autor?, edicion?, isbn?, marca?, modelo?}`.
Los datos editoriales se admiten para libros y marca/modelo para otros tipos.

Unidad: `{bien_id, codigo_inventario, ubicacion, condicion_fisica, accesorios?,
estado?, serie?, marca?, modelo?, adquirido_en?, observaciones?}`.
`custodia`, si se envía, solo acepta `escuela`; `adscrito_laboratorio` solo false.
Accesorios es una lista de textos. La fecha de adquisición usa `YYYY-MM-DD` o null.
El estado inicial solo puede ser disponible o mantenimiento, no prestada.

Una serie necesita marca y modelo: se copian de la ficha si no se indican.
Se controla la combinación marca-modelo-serie y el código de inventario único.

Baja:

```json
{"estado":"baja","motivo":"<fundamento autorizado>","confirmar":true}
```

Una unidad prestada no se modifica ni se da de baja desde estas rutas. Debe
registrarse su devolución mediante el módulo de préstamos pendiente. Una unidad
de baja no se reactiva. No existen endpoints DELETE.

## Errores y límites

- 400: formato, campos, referencias o perfil inválidos.
- 401: falta sesión, sesión inválida/vencida o credenciales inválidas.
- 403: sin permiso, origen no autorizado o CSRF inválido.
- 404: registro/ruta inexistente.
- 409: duplicados, integridad, estado o conflicto concurrente.
- 415: escritura sin Content-Type JSON.
- 429: límite de login (`LOGIN_LIMIT`, 10 por IP en 15 minutos por defecto).

Las respuestas no publican SQL, hashes o tokens de sesión. Argon2id usa 64 MiB,
tres iteraciones y paralelismo 1. El límite de login es en memoria y por proceso;
se debe usar un almacenamiento compartido si se ejecutan múltiples instancias.
La API aún no ofrece reset de contraseña, delegación administrativa, reservas,
renovaciones, garantías, incidencias, sanciones ni cierre por pérdida. No contiene frontend.

## Políticas versionadas

Todas las rutas requieren administrador; escrituras también CSRF.

| Método | Ruta | Operación |
| --- | --- | --- |
| GET | `/politicas` | Listar por rol/estado y paginación |
| GET | `/politicas/:id` | Ver versión |
| POST | `/politicas` | Crear borrador, con versión automática por alcance |
| PATCH | `/politicas/:id` | Editar condiciones de un borrador |
| POST | `/politicas/:id/aprobar` | Aprobar y registrar referencia institucional |
| PATCH | `/politicas/:id/vigencia` | Acortar vigencia a una fecha futura |

Filtros de lista: `rol=general|docente|estudiante`,
`estado=borrador|programada|vigente|expirada`, `pagina`, `limite`.

Crear: `{rol, nombre, vigencia_inicio, vigencia_fin?, cupo_total, duracion_cantidad,
duracion_unidad, modalidades, tolerancia_horas?}`. `rol=null` es general; no se
admite personal administrativo ni alcance por tipo todavía. Fechas de API usan
ISO 8601 **con zona horaria**, por ejemplo `2026-10-06T10:00:00-05:00`.

- Duración: cantidad positiva y unidad `horas|dias`; días de 24 horas.
- Modalidades: lista única con `retiro`, `en_sitio` o ambas.
- `garantia_exigida=false`, `renovacion_permitida=false`, `max_renovaciones=0` y
  `tarifa_diaria=0`: cualquier obligación diferente se rechaza hasta que exista su módulo.
- Crear una versión no la aprueba ni autoriza entregas.
- PATCH solo aplica campos enviados y no reinicia tolerancia u otros valores omitidos.

Aprobar:

```json
{"confirmar":true,"referencia_aprobacion":"<documento o acuerdo institucional>"}
```

La referencia se conserva en el evento `politica.aprobada`, junto al actor y fecha.
Las condiciones aprobadas son inmutables. Dos versiones aprobadas de un mismo alcance
no pueden superponerse. General y rol sí pueden coexistir: se elige primero la de rol.

Para sustituir una versión de ese mismo alcance, el borrador debe comenzar en el futuro;
añadir `sustituye_id` a la aprobación. La transacción acorta la vigencia anterior al inicio
de la nueva y aprueba la nueva versión. Si la aprobación falla, se revierten **ambos** pasos.
El intervalo es `[inicio,fin)`, así que versiones consecutivas pueden tocar sus límites.

Acortar vigencia: `{vigencia_fin, confirmar:true, motivo}`. Solo una fecha futura,
posterior al inicio y anterior al fin anterior si existe. No modifica condiciones
históricas ni invalida préstamos ya entregados. La desactivación posterior del aprobador
original no invalida su aprobación ni impide retirar esa vigencia con otro administrador.

## Entregas y préstamos propios

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/prestamos/mios` | Solo los préstamos de la cuenta autenticada |
| GET | `/prestamos` | Administrador: todos los préstamos |
| GET | `/prestamos/:id` | Administrador o titular; otro titular recibe 404 |
| POST | `/prestamos` | Administrador + CSRF: entrega directa |
| POST | `/prestamos/:id/devolucion` | Administrador + CSRF: recepción e inspección |

Filtros de listados: `estado=activo|vencido|devuelto`, `unidad_id`, `desde`, `hasta`,
`pagina`, `limite`. El listado administrativo además acepta `solicitante_id`.
`mios` **no acepta** un solicitante alternativo. El periodo filtra la fecha de entrega
en `[desde,hasta)`. Detalles de préstamos propios no exponen otros titulares ni contactos.

Entrega:

```json
{
  "solicitante_id":"<id de la cuenta>",
  "unidad_id":"<id de la unidad>",
  "vencimiento":"<fecha ISO 8601 con zona horaria>",
  "modalidad":"retiro",
  "condicion_entrega":"<inspección real>",
  "accesorios_entrega":["<cada accesorio entregado>"],
  "confirmar":true
}
```

`observaciones_entrega` es opcional. No aceptar `inicio`, `autorizado_por`, políticas
o condiciones aplicadas del navegador: inicio y autorizante se resuelven en el servidor,
y PostgreSQL copia la versión/valores efectivos.

Se valida cuenta/persona/perfil, modalidad, plazo y cupo total sobre **todos** los
préstamos abiertos del solicitante, incluyendo vencidos. La unidad debe estar disponible.
En este MVP se verifican todos los accesorios registrados; si el inventario era incorrecto,
un administrador debe corregirlo antes de entregar. La comparación distingue cantidades
de accesorios repetidos y no distingue mayúsculas o espacios externos.

Respuesta 201: préstamo con `estado`, condiciones aplicadas y `unidad_estado=prestada`.
Entrega e inventario se confirman juntos. Repetir una entrega sobre una unidad ya prestada
responde 409, sin crear otra. El uso `en_sitio` inicia responsabilidad sin cambiar ubicación.

## Devolución e inspección

```json
{
  "condicion_devolucion":"<inspección real>",
  "accesorios_devolucion":["<cada accesorio recibido>"],
  "apta":true,
  "estado_unidad":"disponible",
  "confirmar":true
}
```

Opcionales: `observaciones_devolucion`, y `motivo_baja` obligatorio si
`estado_unidad=baja`. Destinos: disponible, mantenimiento, baja. Un daño se declara
con `apta=false`; no se infiere aptitud a partir de texto libre.

- No apta o con accesorios faltantes: no puede volver a disponible.
- Accesorios faltantes: no puede declararse apta; se verifican nombres y cantidades.
- Devolver actualiza condición y accesorios realmente recibidos en inventario.
- El receptor y la fecha/hora real los genera el servidor.
- El titular puede estar inactivo: la recepción administrativa sigue permitida.
- Devolución con baja es `devuelto` y conserva fecha real de recepción; **no** simula
  un cierre por pérdida. La baja conserva motivo y fecha en la unidad.

Respuesta 200: préstamo con inspección y estado de unidad. Repetir exactamente la
misma inspección devuelve `devolucion_repetida=true`, conserva la fecha original y no
duplica el cierre ni el evento `prestamo.devuelto`. Una inspección distinta posterior
responde 409. Repetir no revierte reparaciones o cambios posteriores del inventario.

Los nuevos campos `devolucion_apta` y `destino_devolucion` conservan el resultado inicial
aunque después se repare la unidad. Pueden ser null en devoluciones anteriores a la
migración: se preserva la ausencia histórica del dato y no se inventa aptitud retrospectiva.

Préstamos abiertos se muestran activos/vencidos según el reloj PostgreSQL; vencer no
libera unidad ni cupo. La vista devuelve `retraso_segundos` y `exceso_tolerancia_segundos`
como **cadenas decimales** para conservar precisión. Tras devolver, usan fecha real y
las condiciones conservadas del préstamo. Se registran en la auditoría del cierre.
No se generan multas, sanciones o cobros automáticamente en este avance.
El módulo de incidencias para daños/faltantes se añadirá después; por ahora queda la
inspección explícita, el estado fuera de servicio y el evento correspondiente.

## Auditoría administrativa de solo lectura

- GET `/auditoria`: administrador, filtros `entidad`, `entidad_id`, `actor_usuario_id`,
  `accion`, `resultado`, `desde`, `hasta`, `pagina`, `limite`.
- GET `/auditoria/:id`: administrador, detalle del evento.

No hay POST/PATCH/DELETE de eventos por HTTP. Correcciones de negocio generan nuevos
eventos automáticamente y no reescriben el pasado. Los intentos de login rechazados
se registran; otros rechazos de negocio revierten sus cambios, sin un evento adicional
de intento en este MVP. Los filtros de fecha usan `[desde,hasta)`.
