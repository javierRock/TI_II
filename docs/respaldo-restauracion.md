# Respaldo y restauración

Desde `backend/`:

```sh
npm run db:backup
npm run db:backup -- --verify
```

`pg_dump` crea un respaldo consistente en formato custom, sin propietarios ni
privilegios, dentro de `.local/backups/`. El directorio tiene permiso 0700 y el
archivo 0600. Se imprime el checksum SHA-256, no credenciales.

La verificación requiere `ADMIN_DATABASE_URL` del servidor de desarrollo.
Crea una base temporal con nombre aleatorio, restaura con `pg_restore`, compara
conteos de las 12 tablas y elimina **solo esa base temporal creada por el proceso**.
Las FK y restricciones se restauran con el esquema. Ejecutar `--verify` sin
escrituras concurrentes, ya que los conteos comparativos no comparten el snapshot
interno de `pg_dump`.

No se sobrescribe ni se elimina la base principal. Para una recuperación real:

1. Detener escrituras y preservar la base dañada para diagnóstico.
2. Crear una base nueva con el propietario de migraciones.
3. Restaurar el dump con clientes PostgreSQL compatibles.
4. Verificar tablas, relaciones, préstamos abiertos, unidades y auditoría.
5. Aplicar los permisos de ejecución con el script de migraciones apuntando a
   la base restaurada: los dumps excluyen privilegios deliberadamente.
6. Actualizar las URLs de conexión y probar antes de reabrir el servicio.

El `.env` y los roles/contraseñas no forman parte del dump. Conservar los secretos
por un mecanismo separado y restringido. Los respaldos contienen datos personales:
no publicarlos, cifrarlos si se transportan y mantener una copia fuera del equipo.

El script no programa respaldos automáticamente. La frecuencia diaria, retención,
pérdida tolerable y tiempo de recuperación requieren aprobación institucional.
