# Arquitectura MySQL

## Organización de archivos

```text
backend/
  src/                    # Aplicación: configuración, conexión y módulos de negocio
  database/               # Guía de lectura y compatibilidad de formato SQL
    migrations/           # Tablas, vistas, protecciones, auditoría y permisos
  scripts/                # Migración MySQL, administración y carga demo explícita
  .env.example            # Ejemplo para ejecución sin Docker
frontend/                 # HTML, estilos y módulos JavaScript
infra/docker/
  mysql/usuarios.sh       # Usuarios SQL de la aplicación en volumen nuevo
  compose.yaml            # Servicios MySQL, preparación y aplicación
  .env.example            # Ejemplo exclusivo de infraestructura Docker
docs/                     # Arquitectura, modelo, API, operación y demostración
```

No hay configuración de bases en la raíz. La aplicación solo consume variables
estándar de MySQL. No se incluyen suites ni dependencias de pruebas automatizadas.
La herramienta de formato es de desarrollo y no se instala en la imagen de
ejecución. Los archivos privados `.env` no se versionan.

Monolito modular con Node/Express y frontend HTML/CSS/JavaScript del mismo origen.
No hay microservicios, colas ni ORM. Docker está exclusivamente en `infra/docker/`.

```text
Rutas HTTP → servicios → reglas y repositorios → MySQL
```

- `backend/src/config/env.js`: valida variables DB_HOST/PORT/NAME/USER/PASSWORD.
- `backend/src/db/pool.js`: único punto de conexión, basado en mysql2/promise.
- `backend/src/db/transaction.js`: una conexión, COMMIT o ROLLBACK y limpieza de actor.
- `backend/src/db/actor-transaction.js`: revalida sesión y permisos al escribir.
- `backend/src/modules/`: autenticación, personas, inventario, políticas,
  préstamos, reservas y auditoría. Cada módulo separa rutas, esquemas, servicios,
  repositorios y reglas cuando son necesarias.
- `backend/database/migrations/`: SQL versionado, independiente de Docker.
- `backend/database/README.md`: mapa de responsabilidades y convenciones de lectura
  del SQL. El formato revisado mantiene el orden y la lógica de las migraciones.
- `frontend/js/views/`: pantallas por módulo y utilidades DOM seguras.

## Concurrencia

InnoDB, READ COMMITTED y bloqueos explícitos. Cuentas involucradas ordenadas por
identificador → unidad → reserva/préstamo. Las políticas se bloquean por alcance.
La comprobación de disponibilidad y cupo ocurre después de adquirir bloqueos.
No se llama al pool durante una transacción que ya tiene conexión asignada.
Conflictos/deadlocks devuelven 409; una escritura no se reintenta ciegamente.

Reservas confirmadas y préstamos abiertos se combinan para calcular conflictos.
El cupo es el máximo de intervalos simultáneos mediante barrido de eventos.
Un vencido ocupa un intervalo sin fin conocido hasta su cierre. Los límites son
semiabiertos `[inicio, fin)`. La conversión excluye su propia reserva del cómputo.

La expiración es visible por el reloj incluso sin proceso periódico. Un proceso
del servidor persiste expiraciones cada minuto y sus triggers registran auditoría.

## Integridad y límites

FK, CHECK, unicidad y columna generada impiden referencias inválidas y dos préstamos
abiertos por unidad. Triggers protegen auditoría, estados terminales y políticas.
Los servicios protegen reglas entre registros y sincronizan préstamo/inventario.
No se promete prevenir toda inconsistencia frente a un DBA que use permisos de
mantenimiento: Workbench dispone de un editor limitado para no saltarse servicios.

Las credenciales SQL de migración no llegan al servidor web. Argon2id para claves,
cookie HttpOnly/SameSite y CSRF en escrituras. Sesiones revocadas ante desactivación
o cambios de rol/contraseña. No hay secretos en el almacenamiento del navegador.
No se implementan garantías, multas, renovaciones ni cierre por pérdida.
