# Respaldo y recuperación MySQL

Desde `infra/docker/`, crear un respaldo lógico consistente de InnoDB:

```sh
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump -uroot --single-transaction --routines --triggers --no-tablespaces DBsistema_prestamos > /tmp/prestamos.sql'
docker compose cp mysql:/tmp/prestamos.sql ./prestamos.backup.sql
```

La redirección binaria/texto se realiza dentro de Linux, no en PowerShell. Las
comillas del primer comando sirven en Bash/Zsh/PowerShell; desde CMD usar PowerShell.
El respaldo incluye datos personales y hashes: acceso restringido, cifrado si se
transporta y nunca Git. `*.backup.sql` está excluido del repositorio.

Restaurar primero en **otra instancia MySQL 8.4** con usuarios SQL preparados y
una base vacía del mismo nombre. Copiar el archivo al contenedor de validación y
ejecutar el cliente desde ahí:

```sh
docker compose cp ./prestamos.backup.sql mysql:/tmp/restaurar.sql
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot DBsistema_prestamos < /tmp/restaurar.sql'
```

Estos comandos de restauración deben apuntar al proyecto de validación, no al
servidor principal. No sobreescribir una base con información más reciente.
Verificar recuentos por tabla, relaciones, reservas confirmadas, préstamos abiertos,
sesiones, políticas y auditoría. Comprobar login y una entrega/devolución de prueba
en la copia antes de considerarla recuperable. Los definers de triggers/rutinas
requieren que exista `prestamos_migrator` en la instancia destino.

No compartir carpetas binarias de volúmenes entre motores distintos ni entre
versiones mayores. No usar `down -v` como procedimiento de actualización.

## Comprobación local realizada

Se generó un dump con rutinas y triggers de la base MySQL principal y se restauró
en una instancia temporal con el mismo nombre de esquema. Se compararon todas las
tablas por filas ordenadas y hash, y ambas vistas por resultado ordenado. La base
principal no se modificó durante la restauración. El respaldo contiene únicamente
la demo ficticia de esta instalación, no datos institucionales reales.
