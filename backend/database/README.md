# SQL y organización de la base de datos

Base predeterminada: **DBsistema_prestamos**, MySQL 8.4 / InnoDB.

```text
database/
  migrations/                 # Única fuente SQL ejecutable, en orden numérico
    001_tablas.sql            # Usuarios, catálogo, políticas, operaciones y auditoría
    002_vistas.sql            # Estados y disponibilidad para consulta
    003_protecciones.sql      # Auditoría inmutable y revocación de accesos
    004_auditoria.sql         # Procedimiento y triggers de trazabilidad
    005_editor.sql            # Privilegios limitados del cliente gráfico
    006_estados.sql           # Transiciones válidas y estados terminales
    007_entrega_inmutable.sql # Ampliación de la protección histórica del préstamo
    008_comprobaciones.sql    # Restricciones complementarias
    009_editor_vistas.sql     # Lectura de vistas y soporte académico
    010_catalogo_usuarios.sql # Coherencia de fichas, cuentas y aprobaciones
  formatos-compatibles.json   # Pares SHA-256 del reformateo sin cambios de lógica
```

La creación de tablas permanece en un archivo ordenado por dependencias, con
secciones por módulo. No se duplican esquemas completos ni se fragmenta el SQL
en archivos que deban ejecutarse manualmente. Las migraciones posteriores amplían
el esquema; `001_tablas.sql` por sí solo no representa todas las protecciones finales.

El ejecutor es `backend/scripts/migrate.js`. Los datos demo y la creación del
administrador se mantienen en `backend/scripts/`, separados del esquema.
Docker únicamente ejecuta la preparación y configura las cuentas técnicas.

## Convenciones de lectura

- Cuatro espacios de sangría; una columna o restricción por línea.
- Separar columnas, relaciones y comprobaciones mediante líneas en blanco.
- Expresar condiciones largas en varias líneas, respetando sus paréntesis.
- Separar cada tabla, vista, procedimiento y trigger.
- Explicar el motivo de una regla, no repetir en comentarios lo que ya dice SQL.
- Mantener nombres existentes y valores literales para no cambiar contratos.
- Usar `DELIMITER $$` en rutinas y restaurar `DELIMITER ;` al terminar.

## Compatibilidad con bases existentes

El reformateo de las diez migraciones se verificó comparando sus tokens SQL con
los originales: solo cambian espacios y comentarios. El archivo de compatibilidad
registra ambos SHA-256 exactos por nombre. Si la base conserva el checksum original
y el archivo coincide exactamente con el formato aprobado, el ejecutor lo informa
y omite la migración. No recrea tablas ni cambia datos o checksums históricos.

No se acepta cualquier archivo con espacios diferentes: un checksum desconocido
o una migración parcial siguen deteniendo la preparación. Este registro no es un
mecanismo para autorizar modificaciones funcionales. Para cambiar estructura,
restricciones o reglas, añadir una nueva migración numerada; nunca reemplazar las
ya aplicadas ni borrar `schema_migrations` para forzar un arranque.
