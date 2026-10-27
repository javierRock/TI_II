# Migración de datos PostgreSQL → MySQL

El código activo de esta rama solo usa MySQL. PostgreSQL permanece en `main` y sus
contenedores/volúmenes no se eliminan. La demostración nueva **no importa** cuentas
o préstamos anteriores automáticamente.

## Procedimiento controlado

1. Detener escrituras en el sistema anterior durante el corte.
2. Respaldar con pg_dump y comprobar restauración en una instancia de validación.
3. Exportar las tablas de negocio del esquema `prestamos` a JSON UTF-8.
4. Preparar MySQL, aplicar migraciones y mantener `SEED_DEMO=false`.
5. Ejecutar `backend/scripts/importar-json.js` con cuenta de mantenimiento.
6. Comparar recuentos, referencias, fechas, políticas y claves Argon2id; probar login.
7. Cambiar el acceso de usuarios después de verificar, conservando el origen.

## Formato de exportación

```json
{
  "origen": "postgresql",
  "version": 1,
  "tablas": {
    "personas": [], "usuarios": [], "planes_estudio": [], "semestres_plan": [],
    "perfiles_academicos": [], "tipos_bien": [], "bienes": [],
    "unidades_inventario": [], "politicas_prestamo": [], "reservas": [],
    "prestamos": [], "eventos_historial": []
  }
}
```

Cada elemento es un registro con las columnas originales. Exportar BIGINT como
cadenas, fechas con zona ISO, JSON como objetos/listas y los cinco tipos de bien.
No exportar contraseñas en texto plano; conservar `password_hash` Argon2id.
El archivo contiene datos sensibles y debe llamarse, por ejemplo,
`prestamos.export.json`, fuera de Git. Si PostgreSQL no tiene reservas, usar `[]`.

Desde `backend/`, con un archivo privado `.env.mantenimiento` que configure las
variables estándar y `DB_USER=prestamos_migrator`:

```sh
node --env-file=.env.mantenimiento scripts/importar-json.js --archivo /ruta/privada/prestamos.export.json --confirmar
```

El destino debe estar vacío, sin demo. La inserción es transaccional y se rechazan
referencias, códigos o inspecciones incompatibles, sin inventar datos faltantes.
El origen no se modifica. Identificadores de negocio y hashes se conservan. El
historial original se añade al historial de importación; sus IDs originales y
referencias de rectificación se conservan en `detalle.importacion` para evitar
colisiones con los eventos nuevos. No se copian sesiones: se exige un nuevo login.

## Validación realizada

Se extrajo en modo de solo lectura la demo PostgreSQL existente y se importó en
una base MySQL temporal: 4 personas/cuentas, 5 fichas, 7 unidades, 2 préstamos,
1 plan, 10 semestres, 3 perfiles, 1 política y 83 eventos originales. Se compararon
recuentos y hashes Argon2id sin imprimirlos. No se importó en la base principal
ni se modificó el origen. No equivale a validar datos institucionales reales.
También se provocó una referencia inválida a mitad de importación en un destino
temporal con las diez migraciones: se revirtieron datos y auditoría, incluidos los
tipos preexistentes; después la importación correcta terminó sin copiar sesiones.

## Límites del corte

La herramienta no interpreta un pg_dump ni realiza una conversión automática del
SQL PostgreSQL. La extracción JSON y una restauración completa con datos reales
deben verificarse por separado antes del corte. Datos históricos sin inspección
que no satisfagan el modelo destino necesitan una decisión de migración explícita;
el importador no inventa aptitud ni elimina obligaciones para conseguir que pasen.
No retirar PostgreSQL hasta concluir esta validación. No se ha ejecutado aquí una
importación de datos institucionales reales.
