# Infraestructura Docker

Requiere Docker Engine + Compose moderno en Linux (incluidos Ultramarine y Arch),
o Docker Desktop con contenedores Linux en macOS/Windows. Las imágenes soportan
AMD64/ARM64; deben probarse por separado en cada plataforma real.

## Preparación

Desde la raíz del repositorio, si hay Node instalado:

```sh
node infra/docker/generar-config.js
```

El generador crea `.env` con secretos aleatorios y no sobrescribe archivos existentes.
Sin Node, ejecutar la utilidad usando una imagen:

Linux/macOS:
```sh
docker run --rm --user "$(id -u):$(id -g)" -v "${PWD}:/workspace:Z" -w /workspace node:22-bookworm-slim node infra/docker/generar-config.js
```

Windows PowerShell:
```powershell
docker run --rm -v "${PWD}:/workspace" -w /workspace node:22-bookworm-slim node infra/docker/generar-config.js
```

También puede copiarse `.env.example` a `.env` y reemplazar las contraseñas.
`DB_PASSWORD` debe ser alfanumérica; el generador usa hexadecimal. Las claves de
personas demo son distintas de las claves SQL. No compartir `.env`.

## Arranque

```sh
cd infra/docker
docker compose config --quiet
docker compose up --build -d --wait
docker compose ps -a
```

1. `mysql`: MySQL 8.4.8 y volumen `prestamos-mysql_mysql_data`.
2. `preparar-db`: aplica migraciones MySQL versionadas y, opcionalmente, demo.
3. `app`: servidor web y frontend, sin credenciales de mantenimiento.

El arranque crea solo `DBsistema_prestamos`: no prepara bases de pruebas.
La configuración privada activa está en `infra/docker/.env`; para ejecutar sin
Docker se usa `backend/.env`. No se necesitan archivos `.env` en la raíz.
Para comprobar la aplicación, consultar la
[guía de verificación manual](../../docs/demostracion.md).

`preparar-db` debe terminar con código 0. Si falla, la aplicación no arranca.
Los scripts de inicialización MySQL solo crean usuarios sobre un volumen nuevo;
las migraciones del esquema se comprueban también en arranques posteriores.
Se habilita `log_bin_trust_function_creators` para que el usuario de migración
pueda crear los triggers sin privilegio global SUPER; no se publica root a Internet.

La configuración de desarrollo publica web y MySQL solo en `127.0.0.1`.
Cambiar juntos `APP_PORT` y `APP_ORIGIN` si el puerto está ocupado. Usar exactamente
ese origen en el navegador. No abrir HTML directamente ni usar Live Server.

```sh
docker compose logs preparar-db app
docker compose down
```

`down` conserva los datos. **No usar `down -v`** para detener: elimina el volumen.
No borrar el volumen para resolver una migración parcial o cambiar una contraseña.

## Sin demostración

Establecer `SEED_DEMO=false` antes del primer arranque. Crear el primer administrador
desde una terminal interactiva, con autorización institucional:

```sh
docker compose run --rm preparar-db node scripts/crear-admin-interactivo.js
```

El comando pregunta los datos y oculta la contraseña. No modifica administradores
existentes. Las otras cuentas y perfiles se crean desde la aplicación.

## Actualización

`docker compose up --build -d --wait` instala el nuevo código y migraciones pendientes.
No modificar archivos SQL ya aplicados. El ejecutor verifica checksum y marca las
migraciones incompletas: MySQL no revierte automáticamente DDL. Revisar el punto de
fallo antes de reparar, nunca borrar el historial o el volumen. El reformateo
visual revisado de las diez migraciones iniciales se reconoce por sus hashes
exactos, sin reejecutar DDL ni modificar el checksum histórico. Ver
[`backend/database/README.md`](../../backend/database/README.md).

## Problemas frecuentes

- `ports additional properties`: `ports` va dentro de `services.mysql`, no en la raíz.
- Conexión rechazada: verificar estado saludable y publicación `3306:3306`.
- TLS handshake timeout al descargar: es conectividad con Docker Hub, no error SQL.
  Revisar red/proxy/VPN, fecha del equipo y reintentar `docker compose pull mysql`;
  no deshabilitar TLS.
- `Access denied`: las credenciales del volumen no cambian al editar `.env`.
- Permisos del socket Docker: configurar el servicio y autorización del usuario,
  no hacer público el socket.
- SELinux: los montajes del proyecto usan `:Z`; no montar el directorio personal completo.

Esta configuración no configura HTTPS ni despliegue público. No cambiar
`NODE_ENV=production` sin preparar HTTPS, cookies Secure y secretos de servicio.
