# Sistema de préstamos de bienes

Backend inicial con **Node.js 22+, Express 5 y PostgreSQL**. Basado en
`Analisis_Requisitos/main.tex` y sus secciones. La documentación original se conserva.

## Estado del backend

- Base PostgreSQL con 12 tablas de negocio/soporte y dos vistas.
- Migraciones versionadas, usuarios separados y auditoría automática.
- Integridad de entregas directas y devoluciones, cupos y políticas históricas.
- API: sesiones, personas/cuentas, perfiles, planes académicos, catálogo/inventario,
  políticas versionadas, entregas, devoluciones, préstamos propios y auditoría.
- Contraseñas Argon2id, cookies HttpOnly y validación de permisos y CSRF.
- Comando seguro para crear el primer administrador con autorización confirmada.
- Pruebas unitarias, de integración y de concurrencia sobre PostgreSQL real.

**El backend ya cubre el flujo básico de préstamos directos; todavía no hay frontend.**
No es un servicio listo para producción. Reservas, renovaciones, garantías,
incidencias, pérdidas y sanciones se incorporarán por etapas.

## Inicio rápido: PostgreSQL instalado localmente

Requiere `node`, `npm`, `initdb`, `pg_ctl`, `pg_dump` y `pg_restore` en el PATH.
En este equipo se utiliza PostgreSQL 18. La instancia del proyecto no modifica
el servidor PostgreSQL existente en el puerto 5432.

```sh
cd backend
npm ci
npm run db:local -- start
npm run db:migrate
npm run db:check
npm run dev
```

El primer inicio genera un `.env` privado con contraseñas aleatorias si no existe.
No compartir ni versionar ese archivo. Si se copió `.env.example`, reemplazar
las contraseñas de ejemplo antes de iniciar.

| Parámetro | Valor local |
| --- | --- |
| Host PostgreSQL | `127.0.0.1` |
| Puerto PostgreSQL | `55432` |
| Base principal | `prestamos` |
| Base de pruebas | `prestamos_test` |
| Usuario de migraciones | `prestamos_owner` |
| Usuario de API | `prestamos_api` |
| API | `http://127.0.0.1:3000/api/v1/health` |

Los datos se conservan en `.local/postgres/`, excluido de Git. Para detener
únicamente esta instancia:

```sh
npm run db:local -- stop
```

Volver a iniciarla no elimina ni recrea sus datos. No usar `db:local` contra un
cluster ajeno al proyecto. No hay arranque automático después de reiniciar el equipo.

## Alternativa: contenedor

No ejecutar el contenedor y la instancia local a la vez: comparten puerto.
Crear `.env` a partir de `.env.example` con credenciales propias y coherentes
entre `LOCAL_POSTGRES_ADMIN_PASSWORD` y `ADMIN_DATABASE_URL`.

Desde la raíz:

```sh
docker compose up -d
```

Desde `backend/`:

```sh
npm ci
npm run db:provision
npm run db:migrate
npm run dev
```

La alternativa de contenedor no se ha ejecutado en este avance; la validación
se hizo con PostgreSQL instalado localmente. El aprovisionamiento crea roles
limitados y bases principal/pruebas sin sobrescribir contraseñas de roles existentes.

## Pruebas

```sh
npm test
npm run test:integration
```

Integración exige URLs de pruebas separadas, con nombre terminado en `_test`.
Las pruebas comunes revierten sus cambios. Las pruebas de concurrencia conservan
fixtures identificadas aleatoriamente **solo en la base de pruebas**. Las pruebas
de API también conservan fixtures. Sus políticas y cuentas son ficticias; no se
cargan en la base principal. La suite de préstamos cierra las vigencias de las
versiones de prueba que crea y espera a que terminen para permitir nuevas ejecuciones;
no borra su historial. No ejecutar suites de integración en paralelo sobre la misma base.

## Primer administrador

No se crea ningún usuario por defecto. Un responsable con autorización institucional
debe ejecutar el bootstrap una sola vez después de las migraciones. El comando usa
la conexión de migraciones y deja auditoría de la atribución inicial; no modifica
cuentas existentes ni sirve para recuperar administradores desactivados.

Ejemplo en **Bash**, reemplazando los datos por los de la persona autorizada:

```bash
read -r -s -p 'Contraseña (12–128 caracteres): ' ADMIN_PASSWORD
printf '\n'
printf '%s' "$ADMIN_PASSWORD" | npm run admin:create -- \
  --documento '<documento real>' --nombre '<nombre real>' \
  --correo '<correo válido>' --usuario '<usuario elegido>' \
  --password-stdin --confirmar-autorizacion
unset ADMIN_PASSWORD
```

La contraseña llega por stdin, no por argumentos ni historial. No usar una contraseña
de ejemplo. El resto de las cuentas se registra mediante la API administrativa.
Crear una cuenta con rol administrativo **no** otorga atribuciones administrativas.

## Uso de la API

Contrato y ejemplos: [docs/api.md](docs/api.md). Tras crear el administrador e iniciar
el servidor, usar `POST /api/v1/auth/login`. La cookie HttpOnly identifica la sesión;
el `csrf_token` de la respuesta se envía como `X-CSRF-Token` en escrituras autenticadas.

`APP_ORIGIN` por defecto es `http://127.0.0.1:<PORT>`. Si accedes con `localhost` u
otro nombre, configura el origen exacto en `.env`. En producción debe ser HTTPS.
Si `NODE_ENV=production` está definido en el entorno, no se carga `.env`: inyectar
solo la URL restringida y configuración web en la API. Las URLs de propietario y
administrador pertenecen a procesos separados de migración/mantenimiento; no montar
el `.env` de desarrollo en el servicio desplegado.

### Flujo operativo mínimo

1. Crear el primer administrador autorizado.
2. Registrar los planes/semestres reales, personas, cuentas y perfiles habilitados.
3. Registrar fichas y unidades prestables bajo custodia de la Escuela.
4. Crear una política general o por rol como borrador y aprobarla explícitamente,
   con referencia a la autorización institucional.
5. Registrar la entrega con inspección, todos los accesorios y vencimiento permitido.
6. Registrar devolución e inspección; una unidad no apta no puede quedar disponible.
7. Consultar préstamos propios/administrativos y los eventos de auditoría.

Entregar exige una política aprobada aplicable. Aprobar otra versión no cambia los
plazos ni condiciones de préstamos anteriores. Las obligaciones todavía no soportadas
(garantías, renovación, multas y bloqueos) no se configuran ni se simulan en este avance.

## Base de datos y evolución

- SQL legible: `backend/db/sql/001_nucleo.sql`.
- Migraciones: `backend/db/migrations/`.
- Modelo y restricciones: [docs/modelo-datos.md](docs/modelo-datos.md).
- Límites de responsabilidades: [docs/arquitectura.md](docs/arquitectura.md).
- Recuperación: [docs/respaldo-restauracion.md](docs/respaldo-restauracion.md).

La base principal solo incluye los cinco tipos permitidos. No contiene personas,
cuentas institucionales, planes académicos ni políticas inventadas. Sin una política
aprobada y un solicitante habilitado no se puede registrar una entrega.

No modificar migraciones ya ejecutadas. Crear nuevas migraciones para cada cambio.
Las migraciones actuales no tienen un `down` destructivo: para una corrección,
aplicar una migración nueva o restaurar un respaldo comprobado.
