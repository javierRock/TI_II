# Préstamos de bienes

Aplicación de la Escuela Profesional de Ciencias de la Computación (UNSA).
**Node.js 22, Express, MySQL 8.4.8 y HTML/CSS/JavaScript**, sin framework frontend.

## Arranque con Docker

Toda la infraestructura está en [`infra/docker/`](infra/docker/README.md), no en
el backend. Desde la raíz, crear una configuración privada una sola vez:

```sh
node infra/docker/generar-config.js
```

Sin Node instalado, consultar las alternativas Docker/PowerShell en esa guía.
Luego:

```sh
cd infra/docker
docker compose up --build -d --wait
```

La base se llama exactamente **`DBsistema_prestamos`**. La web usa el puerto
`APP_PORT` del archivo `infra/docker/.env` (3000 por defecto); MySQL, `MYSQL_PORT`
(3306). Si otra aplicación ocupa el 3000, elegir 3001 y cambiar
también `APP_ORIGIN=http://localhost:3001`. No se detienen ni borran otros proyectos.

Con `SEED_DEMO=true`, la instalación vacía contiene:

| Cuenta | Persona ficticia | Contraseña en el archivo privado |
| --- | --- | --- |
| `demo.admin` | Patricia Valdivia Torres | `DEMO_ADMIN_PASSWORD` |
| `demo.estudiante1` | Diego Quispe Salazar | `DEMO_USER_PASSWORD` |
| `demo.estudiante2` | Lucía Mamani Flores | `DEMO_USER_PASSWORD` |
| `demo.docente` | Andrés Cáceres Medina | `DEMO_USER_PASSWORD` |

Incluye seis libros reales (algoritmos, bases de datos, sistemas operativos,
redes, IA y desarrollo de software), dos ejemplares simulados por título y los
otros cuatro tipos de bienes: **16 unidades**. Los ISBN no verificados se omiten,
no se inventan. Las personas, ejemplares, plan y política son de demostración,
no datos institucionales autorizados. No se incluyen préstamos activos de fábrica:
se crean desde la aplicación para demostrar el ciclo completo.

El seed no cambia contraseñas ni duplica registros. Cambiar `.env` después de
crear una cuenta **no cambia su contraseña**. No subir secretos, datos exportados
o respaldos a Git.

## Módulos

- **Usuarios:** personas, cuentas, perfiles académicos, sesiones y permisos.
- **Catálogo:** fichas, ejemplares, búsqueda paginada y disponibilidad por intervalo.
- **Reservas:** solicitar, confirmar/rechazar, cancelar y convertir en préstamo.
- **Préstamos:** entrega directa o reservada, vencimientos, inspección y devolución.
- Políticas versionadas y auditoría inmutable para el usuario de aplicación.

Las reservas confirmadas usan intervalos `[inicio, fin)`. Se verifica el cupo
simultáneo, no la suma de reservas consecutivas. Las operaciones bloquean cuentas
y unidades y revalidan dentro de la transacción. Un vencido sigue ocupando el bien.

## MySQL Workbench / DBeaver

| Campo | Valor |
| --- | --- |
| Host | `127.0.0.1` |
| Puerto | Valor `MYSQL_PORT`, normalmente `3306` |
| Base / esquema | `DBsistema_prestamos` |
| Usuario | `prestamos_editor` |
| Contraseña inicial | Valor `DB_PASSWORD` en `infra/docker/.env` |

El editor consulta los registros y modifica columnas descriptivas de personas y
libros. No modifica contraseñas, préstamos, reservas ni auditoría. El administrador
web y el usuario SQL son cuentas distintas. [Guía](docs/mysql-workbench.md).

## Verificación y demostración

El proyecto no incluye suites de pruebas automatizadas. El arranque prepara
únicamente la base de la aplicación. Consultar la
[guía de verificación manual](docs/demostracion.md) para comprobar los módulos.

## Sin Docker

Instalar MySQL 8.4 y Node 22. Preparar usuarios SQL limitados y seleccionar la base.
Copiar `backend/.env.example` a `backend/.env`, configurar credenciales y ejecutar
con `node --env-file=.env src/server.js`. Migrar por separado con una cuenta de
mantenimiento: `node --env-file=.env.mantenimiento scripts/migrate.js`.
El backend lee únicamente variables estándar; no detecta ni administra Docker.

## Documentación

- [Arquitectura](docs/arquitectura.md)
- [Modelo de datos y relaciones](docs/modelo-datos.md)
- [Diccionario de datos](docs/diccionario-datos.md)
- [API](docs/api.md)
- [Respaldo y recuperación](docs/respaldo-restauracion.md)

Esta rama utiliza exclusivamente MySQL. No administra ni elimina bases de otros proyectos.
Reservas y préstamos están implementados; garantías, sanciones, pérdidas.
