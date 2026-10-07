# Ejecutar con Docker en Linux, macOS y Windows

## Requisitos

- Docker con Compose v2 actualizado (`docker compose version`).
- Linux: Docker Engine y plugin Compose, o Docker Desktop. Ejecutar Docker con
  un usuario autorizado; no cambiar permisos del socket para hacerlo público.
- macOS: Docker Desktop iniciado, tanto Intel como Apple Silicon.
- Windows: Docker Desktop en modo **contenedores Linux**, preferentemente con
  backend WSL 2, y una terminal PowerShell o CMD.
- Internet para descargar las imágenes y dependencias la primera vez. Como
  referencia, asignar al menos 2 GB de memoria disponibles a Docker.

No es necesario instalar Node.js, npm ni PostgreSQL en el anfitrión. No hay scripts
de shell montados desde Windows ni dependencias nativas copiadas del equipo: Node,
Argon2 y las herramientas se instalan dentro de la imagen Linux. No se fija
`platform`, para conservar el soporte AMD64/ARM64 de las imágenes base.

## 1. Obtener el código y preparar credenciales

Clonar el repositorio y abrir una terminal en su raíz, donde está `compose.yaml`.
Si ya hay un servidor local en el puerto 3000, detenerlo antes de levantar la web
Docker. La base local y sus datos no se modifican.

El generador crea **`.env.docker`**, con cinco contraseñas aleatorias distintas y
sin imprimirlas. Si el archivo ya existe, no lo sobrescribe. No usar `.env` para
Docker: ese archivo pertenece a la instalación PostgreSQL local.

**Linux / macOS (Bash o Zsh):**

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "${PWD}:/workspace" -w /workspace node:22-bookworm-slim node backend/scripts/docker-config.js
```

Se indica el UID/GID del anfitrión para que el archivo no quede propiedad de root.

**Windows PowerShell:**

```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace node:22-bookworm-slim node backend/scripts/docker-config.js
```

**Windows CMD:**

```bat
docker run --rm -v "%cd%:/workspace" -w /workspace node:22-bookworm-slim node backend/scripts/docker-config.js
```

En Docker Desktop, permitir el acceso a la carpeta si aparece un aviso. Si se
prefiere preparar manualmente el archivo, copiar `.env.docker.example` a
`.env.docker` y reemplazar todos los valores `reemplazar_...`. El generador no
necesita construir la aplicación ni descargar dependencias npm.

En Linux con SELinux, si se deniega el acceso al montaje, añadir `:Z` al final
de **este montaje de la carpeta del proyecto** (`"${PWD}:/workspace:Z"`). No montar
ni relabelar el directorio personal completo. Si Docker responde `permission denied`
al conectar al socket, revisar el servicio y la autorización de tu usuario según la
instalación de Docker; no hacer público `/var/run/docker.sock`.

## 2. Iniciar la demostración

El mismo comando funciona en las tres plataformas:

```sh
docker compose --env-file .env.docker --profile demo up --build -d
```

Orden de arranque:

1. `postgres`: PostgreSQL 18 y volumen persistente, sin puerto publicado.
2. `initialize`: crea roles limitados y bases `prestamos`, `prestamos_test` y
   `prestamos_demo`; aplica migraciones y permisos. Termina con código 0.
3. `demo-seed`: carga datos ficticios de forma transaccional únicamente en
   `prestamos_demo`. Termina con código 0.
4. `demo-app`: inicia Express, la API y los archivos HTML/CSS/JS.

Es normal que `initialize` y `demo-seed` estén **Exited (0)**: son trabajos de una
sola ejecución, no servidores. Si fallan, la web no se inicia.

```sh
docker compose --env-file .env.docker --profile demo ps -a
docker compose --env-file .env.docker logs initialize demo-seed demo-app
```

Abrir **http://localhost:3000**. Salud: **http://localhost:3000/api/v1/health**.
Debe responder `{"estado":"ok","base_datos":"disponible"}`.

### Cuentas disponibles

| Usuario | Contraseña en el archivo privado `.env.docker` |
| --- | --- |
| `demo.admin` | `DEMO_ADMIN_PASSWORD` |
| `demo.estudiante1` | `DEMO_USER_PASSWORD` |
| `demo.estudiante2` | `DEMO_USER_PASSWORD` |
| `demo.docente` | `DEMO_USER_PASSWORD` |

Abrir el archivo con un editor local y usar el **valor** de la variable, no su
nombre. La imagen y el repositorio no contienen esas contraseñas. Las cuentas
guardan hashes Argon2id con sales independientes. El servicio web no recibe las
contraseñas de seed ni las credenciales SQL de propietario/superusuario.

### Registros de demostración

- Cuatro personas/cuentas ficticias; solo `demo.admin` tiene atribución.
- Dos perfiles de estudiante y uno de docente habilitados.
- Un plan ficticio con diez semestres.
- Cinco fichas: libro, mesa de ping-pong, visor 3D, parlante y carrito de robótica.
- Siete unidades físicas con códigos `DEMO-*` y accesorios identificados.
- Política general **ficticia**, cupo 2, duración máxima 7 días, retiro/en sitio,
  sin garantías, renovaciones, multas ni bloqueos.
- Un libro prestado a `demo.estudiante1`, con vencimiento inicial a 24 horas.
- Un préstamo de parlante devuelto por `demo.docente`, con inspección y auditoría.

La política y las atribuciones demo **no constituyen autorización institucional**.
No usar esa base para operar con personas o bienes reales. La mesa permite turnos
de demostración sujetos al plazo elegido: no representa una regla aprobada de uso.

El seed registra un marcador auditable de su versión. Repetir el comando conserva
contraseñas, devoluciones, vencimientos, cambios y nuevas operaciones. No "renueva"
el préstamo inicial: al transcurrir el tiempo se mostrará vencido normalmente.
Si la base contiene registros ajenos al seed y no su marcador, rechaza la carga
sin cambios. No se borra ni se reinicializa una base preexistente.

## 3. Probar el flujo

1. Iniciar sesión como `demo.admin`.
2. Consultar personas, inventario y la política demo vigente.
3. Registrar devolución del préstamo abierto, revisando condición y accesorios.
4. Entregar una unidad disponible a `demo.estudiante2`, con vencimiento futuro
   dentro de los 7 días máximos. Para la mesa puede elegirse `en_sitio`.
5. Cerrar sesión e ingresar como `demo.estudiante2` para consultar su préstamo.
6. Volver como administrador, registrar devolución y consultar Auditoría.

El administrador local creado fuera de Docker **no existe** en esta base, salvo
que se realice una restauración explícita. No hay registro público.

## 4. Instalación normal, sin datos ficticios

No iniciar `normal` y `demo` a la vez, ya que publican el mismo puerto. Para cambiar
de modalidad, primero detener los contenedores (sin eliminar el volumen):

```sh
docker compose --env-file .env.docker --profile demo down
docker compose --env-file .env.docker --profile normal up --build -d
```

Esta web utiliza `prestamos`. El seed no se ejecuta. Crear el primer administrador
real desde una terminal interactiva:

```sh
docker compose --env-file .env.docker run --rm manage admin-create
```

El comando pregunta documento, nombre, correo, usuario, confirmación de autorización
y contraseña (sin mostrarla). Funciona dentro del contenedor Linux, sin `read -p`,
variables de Bash/Zsh ni contraseñas en argumentos. Se reutiliza el bootstrap
auditado existente; si ya existe un administrador, no lo modifica ni recupera.
Registrar después los planes, perfiles, bienes y políticas autorizadas desde la web.

`normal` significa **sin demo**, no "producción endurecida". Ambos perfiles son
para pruebas locales: HTTP, publicación en loopback y `NODE_ENV=development`.
Un despliegue público necesita HTTPS, origen exacto, secretos de servicio separados,
respaldos y revisión operativa; no exponer esta configuración directamente a Internet.

## 5. Detener, actualizar y conservar datos

```sh
docker compose --env-file .env.docker --profile demo down
```

Esto conserva el volumen `prestamos_postgres_data`. Al volver a ejecutar `up`,
se aplican las migraciones pendientes y no se duplica el seed. Mantener la misma
configuración de contraseñas: el aprovisionamiento **no cambia passwords de roles
existentes**. Cambiar `.env.docker` por sí solo no cambia sus cuentas.

Después de actualizar el código, usar nuevamente `up --build -d`. No cambiar la
versión mayor de PostgreSQL reutilizando el volumen sin un procedimiento de migración.

**No usar `down -v` para detener normalmente**: elimina el volumen con las tres
bases. No borrar `.env.docker`, el volumen ni datos históricos para corregir un error.

### Puerto ocupado / errores de origen

Cambiar conjuntamente en `.env.docker`, por ejemplo:

```dotenv
APP_PORT=3001
APP_ORIGIN=http://localhost:3001
```

Recrear con `up -d` y abrir ese origen exacto. No alternar entre `localhost` y
`127.0.0.1`, ni abrir `frontend/index.html` o Live Server: el login exige mismo
origen para la cookie y CSRF. Mantener `APP_ORIGIN` sin ruta ni barra final.

## 6. Respaldos y traslado a otro equipo

Docker replica el código y el esquema; los datos reales requieren un respaldo.
Para respaldar la demo sin redirecciones de archivos binarios en PowerShell:

```sh
docker compose --env-file .env.docker exec postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -Fc -d prestamos_demo -f /tmp/prestamos_demo.dump'
docker compose --env-file .env.docker cp postgres:/tmp/prestamos_demo.dump ./prestamos_demo.dump
```

Estos dos comandos usan comillas de Bash/Zsh/PowerShell. En CMD, usar PowerShell
para este procedimiento. Para la base normal reemplazar `prestamos_demo` por
`prestamos` en los nombres y argumento `-d`. El respaldo contiene datos personales
y hashes: restringirlo, **no subirlo a Git** y seguir `respaldo-restauracion.md`.
Nunca intentar compartir el directorio binario del volumen entre versiones o
arquitecturas como sustituto de un respaldo lógico.

## Validación y límites

Las pruebas de seed para desarrolladores se ejecutan desde `backend/` con:

```sh
npm run test:demo
```

Requieren la configuración PostgreSQL local completa, incluido `ADMIN_DATABASE_URL`.
Crean bases temporales de nombre aleatorio terminado en `_demo`, ejecutan migraciones,
verifican carga concurrente, login, hashes, devolución, idempotencia y rollback, y
eliminan **solo las bases temporales que crearon**. No utilizan ni reinician las
bases `prestamos`, `prestamos_test` o `prestamos_demo` para cargar datos ficticios.

La comprobación debe incluir arranque con volumen nuevo, login de las cuatro
cuentas, entrega/devolución, auditoría, repetición del seed y reinicio sin pérdida.

Validación realizada en **Linux AMD64**, con Docker Compose conectado a la API
compatible de **Podman rootless** (el socket Docker del sistema no autoriza al
usuario de este entorno):

- Construcción de la imagen desde cero; instalación de dependencias y Argon2.
- Arranque con volumen nuevo, roles, tres bases y todas las migraciones.
- Health y HTML disponibles; login de las cuatro cuentas y permisos por rol.
- Cinco fichas, siete unidades, política y préstamos iniciales correctos.
- Entrega, historial personal y devolución mediante la API contenerizada.
- Recreación de contenedores conservando cuentas y operaciones; seed sin duplicados.
- Perfil normal arrancado sin personas, cuentas, bienes ni políticas ficticias.
- Imagen con usuario no root y sin `.env`, datos locales ni secretos de mantenimiento
  o seed en el servicio web.
- 30 pruebas unitarias, 51 de integración, 10 de navegador y 7 de seed aprobadas.

La disponibilidad de imágenes multi-arquitectura y la ausencia de scripts
anfitriones no sustituyen pruebas reales en **macOS, Windows o ARM64**, pendientes
de ejecución. No se afirma que sea un despliegue listo para producción.
