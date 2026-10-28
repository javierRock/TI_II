#!/bin/bash
(
set -eu
# Solo se ejecuta dentro de la imagen Linux y sobre un volumen nuevo.
# Las contraseñas SQL se generan hexadecimales para no interpolar SQL arbitrario.
case "$DB_APP_PASSWORD" in ''|*[!a-zA-Z0-9]*) echo 'DB_PASSWORD debe ser alfanumérica'; exit 1;; esac
MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot <<SQL
CREATE USER 'prestamos_app'@'%' IDENTIFIED BY '$DB_APP_PASSWORD';
CREATE USER 'prestamos_editor'@'%' IDENTIFIED BY '$DB_APP_PASSWORD';
GRANT SELECT, INSERT, UPDATE ON DBsistema_prestamos.* TO 'prestamos_app'@'%';
GRANT ALL ON DBsistema_prestamos.* TO 'prestamos_migrator'@'%' WITH GRANT OPTION;
GRANT ALL ON \`DBsistema\\_prestamos\`.* TO 'prestamos_migrator'@'%' WITH GRANT OPTION;
SQL
)
