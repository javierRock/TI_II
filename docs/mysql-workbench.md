# Conexión desde MySQL Workbench o DBeaver

El cliente se instala en el anfitrión; MySQL está dentro de Docker. No utilizar
otro controlador ni el puerto de la aplicación web para esta conexión.

| Campo | Valor |
| --- | --- |
| Método | Standard TCP/IP / MySQL |
| Host | 127.0.0.1 |
| Puerto | MYSQL_PORT de infra/docker/.env (3306 por defecto) |
| Usuario | prestamos_editor |
| Contraseña inicial | DB_PASSWORD de infra/docker/.env |
| Default Schema | DBsistema_prestamos |

El editor puede leer datos de negocio y editar únicamente contacto/nombre de
personas y descripción/bibliografía de libros. No ve hashes de usuarios ni
sesiones y no edita reservas, préstamos o auditoría. La cuenta SQL no es demo.admin.
Por simplicidad académica la clave inicial del editor y la API es la misma;
para otros entornos se deben rotar a contraseñas independientes.

Consulta de comprobación:

```sql
SELECT DATABASE(), CURRENT_USER();
SELECT id, nombre_usuario, rol, activo FROM usuarios;
SELECT * FROM reservas ORDER BY id DESC;
SELECT * FROM prestamos ORDER BY id DESC;
```

Workbench: Database → Reverse Engineer → elegir la conexión y el esquema para
generar el diagrama. Las ediciones de estructura se expresan luego en una nueva
migración; no modificar manualmente el esquema y asumir que Git lo replicará.

Si el cliente muestra Connection refused, comprobar `docker compose ps` desde
infra/docker, el puerto publicado y la salud de mysql. Si dice Access denied,
comprobar usuario/contraseña: cambiar .env no modifica usuarios ya creados.
No habilitar root sin contraseña ni publicar el servidor en todas las interfaces.

## DBeaver: Public Key Retrieval is not allowed

En esta instalación local, editar la conexión → Propiedades del controlador →
`allowPublicKeyRetrieval=true`, mantener host `127.0.0.1` y puerto `3306`, y probar
de nuevo. No requiere cambiar la contraseña ni el método de autenticación MySQL.
La recuperación de claves debe limitarse a este entorno local de confianza; para
servidores remotos configurar TLS con verificación del certificado del servidor.
