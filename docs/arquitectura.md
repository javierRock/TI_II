# Arquitectura actual del backend

```text
backend/
├── src/
│   ├── app.js                 Express, cabeceras, origen y errores
│   ├── server.js              Inicio y apagado controlado
│   ├── config/env.js          Configuración validada, sin publicar secretos
│   ├── api/routes.js          Rutas /api/v1
│   ├── core/seguridad.js      Argon2id, cookies, tokens y CSRF
│   ├── middleware/           Autenticación, permisos, validación y CSRF
│   ├── shared/               Esquemas y errores comunes
│   ├── modules/              autenticacion, personas, inventario, politicas,
│   │                        prestamos y auditoria
│   └── db/
│       ├── pool.js            Pool PostgreSQL con tiempos límite
│       └── transaction.js     Una conexión para toda la transacción
├── db/
│   ├── migrations/            Cambios versionados con node-pg-migrate
│   └── sql/                   SQL inicial legible
├── scripts/                  Aprovisionamiento, comprobación y respaldos
└── tests/                    Unitarias, integración y concurrencia
```

No se crean módulos vacíos. Autenticación, personas e inventario contienen
`routes`, `schemas`, `service` y `repository`; inventario además tiene `rules`.
Políticas sigue el mismo patrón y préstamos añade reglas de entrega/inspección.
Auditoría contiene schemas, rutas de lectura y repositorio. Las rutas hacen la traducción
HTTP mínima y delegan al servicio; no hay controladores adicionales sin necesidad.

## Responsabilidades

- La API autentica, autoriza por atribución y valida solicitudes. Los solicitantes
  acceden a su identidad y al catálogo, no a registros administrativos de personas.
- Los servicios coordinan reglas y usan `withTransaction(pool, callback)`.
- Los repositorios reciben la conexión de la transacción; no hacen `COMMIT`.
- PostgreSQL protege invariantes críticas aunque una consulta omita una validación.
- Nunca usar `pool.query()` para los pasos de una transacción ya abierta.

`actorTransaction` revalida la sesión y la atribución dentro de cada escritura,
bloquea el actor y establece su identidad para los triggers:

```sql
SELECT set_config('app.actor_usuario_id', $1, true);
```

Entregas/devoluciones pasan las cuentas involucradas para bloquearlas en orden
numérico antes de validar al actor, y después bloquean unidad y préstamo. Esto
serializa cupos sin impedir que otros solicitantes usen unidades independientes.
Los alcances de política se bloquean en modo compartido para entregas y exclusivo
para creación/aprobación/retiro de versiones; las entregas no toman un bloqueo global exclusivo.

El tercer argumento de `set_config` hace el contexto local a la transacción y evita que pase a
la siguiente petición del pool. Para un proceso automático se establece
`app.actor_proceso`. Sin contexto se identifica `sql:<usuario_de_conexion>`;
esto permite atribuir migraciones, pero no reemplaza la identidad humana de la API.
Los nombres de proceso y actores deben venir del servidor, no del navegador.

## Transacciones de negocio

Entrega: insertar préstamo y actualizar unidad a `prestada` en la misma transacción.
El trigger bloquea cuentas y unidad, comprueba perfil, política, cupo y modalidad,
y conserva automáticamente las condiciones aplicadas. Un índice único parcial
impide más de un préstamo abierto por unidad. Los triggers diferidos comprueban
que el estado final de préstamo e inventario sea coherente al confirmar.

Devolución: cerrar préstamo con inspección explícita de aptitud y actualizar unidad
a `disponible`, `mantenimiento` o `baja`. La API y el motor impiden disponible si no
está apta o hay accesorios faltantes. No se interpreta texto libre de daños.
El destino se comprueba al confirmar la transacción y queda conservado en el préstamo.
Una repetición idéntica lee el cierre existente sin modificarlo ni reabrirlo.
Crear incidencias formales queda pendiente de ese módulo. Devolver no exige que el
titular siga activo. Retraso se deriva de fechas y tolerancia conservadas; no hay cobros.

Políticas: creación de borrador con versión automática por alcance, aprobación
explícita y referencia institucional auditada. Sustituir una versión futura acorta
la anterior y aprueba la nueva dentro de una sola transacción; un error revierte todo.

La auditoría de cambios confirmados es automática y participa de la misma
transacción. Los intentos de login rechazados generan eventos independientes sin
secretos. Otros intentos fallidos se revierten; sus eventos de rechazo se añadirán
cuando corresponda al implementar los siguientes casos de uso.

## Seguridad y límites actuales

- El usuario de ejecución no es superusuario, no crea roles/base/tablas y no borra
  registros de negocio. El historial no admite edición, eliminación o truncado.
- La cuenta de migraciones tiene privilegios de propietario: mantenerla fuera
  del proceso de API. Un propietario/superusuario puede retirar triggers.
  Con NODE_ENV=production inyectado, no se carga el archivo .env de desarrollo.
  Proveer solo secretos restringidos al servicio y separar los del mantenimiento.
- Hash de contraseña Argon2id y hash del secreto de sesión; no se generan cuentas
  institucionales por defecto.
- Desactivación de persona/cuenta y cambio de rol/atribución/contraseña revocan sesiones.
- La API ofrece sesiones, personas/catálogo/inventario, políticas, préstamos directos,
  devoluciones, historial personal y consulta administrativa de auditoría; escucha
  en loopback. El arranque rechaza cuentas PostgreSQL privilegiadas.
- Cookies HttpOnly/SameSite, CSRF ligado a la sesión, origen autorizado y límite
  de login ya están implementados. En producción se exige APP_ORIGIN HTTPS y
  cookies Secure; el proxy TLS y su configuración de red quedan por desplegar.
- No hay auto-registro ni delegación administrativa por HTTP en este avance.
- No se procesan reservas, renovaciones, garantías, pérdidas o sanciones; el esquema
  rechaza políticas con obligaciones todavía no soportadas.
- El contrato está en `docs/api.md`; los listados tienen paginación y los ids se
  mantienen como cadenas para no perder precisión.
- Los deadlocks/conflictos transaccionales se traducen a 409. No se reintentan
  automáticamente escrituras; el cliente puede repetirlas después del rollback.
  Nunca confirmar operaciones parciales.
