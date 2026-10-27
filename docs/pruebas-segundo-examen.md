# Evaluación del segundo examen

Usar exclusivamente **DBsistema_prestamos_test**. El bootstrap Docker prepara esa
base y privilegios limitados. Las pruebas conservan fixtures ficticias identificadas
por sufijos aleatorios; no necesitan borrar el historial ni la base en cada ejecución.

Desde `backend/`, con Node 22 y dependencias instaladas:

```sh
npm test
```

Integración (Bash/Zsh):
```sh
DB_NAME=DBsistema_prestamos_test node --env-file=../infra/docker/.env --test tests/integration/examen.test.js
```

PowerShell:
```powershell
$env:DB_NAME='DBsistema_prestamos_test'
node --env-file=../infra/docker/.env --test tests/integration/examen.test.js
Remove-Item Env:DB_NAME
```

CMD:
```bat
set DB_NAME=DBsistema_prestamos_test
node --env-file=../infra/docker/.env --test tests/integration/examen.test.js
set DB_NAME=
```

Para navegador, sustituir la ruta final por `tests/browser/frontend.test.js`.
Playwright usa Chrome/Chromium instalado o su navegador descargado con
`npx playwright install chromium`. `BROWSER_EXECUTABLE_PATH` selecciona otro
ejecutable. No se desactiva sandbox por defecto; `BROWSER_NO_SANDBOX=1` solo para
entornos de pruebas aislados que lo requieran. Las pruebas de navegador necesitan
Node y las bibliotecas del navegador en el anfitrión; no son un requisito para
ejecutar la aplicación con Docker.

## Matriz implementada

| Módulo | Escenarios |
| --- | --- |
| Usuarios | Credenciales erróneas, sesión obligatoria, privilegios, duplicados y desactivación |
| Catálogo | ISBN compartido, código único y disponibilidad temporal sin titulares |
| Reservas | Intervalos pasados/invertidos, acceso ajeno, cancelación, confirmación y estados terminales |
| Cupo | Barrido temporal, periodos consecutivos y confirmaciones concurrentes |
| Préstamos | Entrega directa contra reserva, doble entrega y conversión concurrente |
| Devoluciones | Reintento idéntico, cuenta inactiva, daño y cancelación de reservas afectadas |
| Vencimiento | Derivado del reloj; unidad/cupo siguen ocupados |
| Integridad | Rollback también revierte auditoría; historial y política aprobada protegidos |
| SQL | API sin permisos DDL/DELETE; editor sin escritura de operaciones críticas |
| Navegador | Login, catálogo, solicitud real, visibilidad por rol, móvil y logout |

## Resultado de la validación local

- 24 pruebas unitarias aprobadas.
- 15 escenarios de integración aprobados sobre MySQL 8.4.8 real (16 entradas
  contadas por Node al incluir el bloque principal), incluidos tres conflictos concurrentes.
- 1 prueba de navegador aprobada con Chrome/Chromium.
- Conversión revertida íntegramente al provocar un fallo del trigger de auditoría
  del inventario: sin préstamo huérfano, reserva atendida ni eventos parciales.
- Instalación desde volumen vacío con las diez migraciones y demo; preparación
  terminada en código 0 y aplicación saludable.
- Recreación de todos los contenedores en proyecto aislado: recuentos y hashes
  idénticos en diez tablas, incluidas reservas, sesiones y auditoría, sin duplicar seed.
- Respaldo lógico restaurado en otra instancia: todas las tablas y ambas vistas
  comparadas; PostgreSQL y MySQL principales sin sobrescrituras.
- Importación de la demo PostgreSQL en un destino temporal: fallo intermedio
  revierte datos/auditoría y posterior importación correcta conserva hashes e historial.
- `npm audit --omit=dev`: cero vulnerabilidades informadas en la ejecución local.

La matriz cubre las reglas con escenarios representativos, no certifica todas las
combinaciones de entradas ni reemplaza una prueba de aceptación con usuarios reales.

## Guion de presentación

1. Mostrar conexión MySQL/Workbench y diagrama.
2. Login como estudiante, consultar catálogo y solicitar un intervalo futuro.
3. Login como administrador, confirmar y mostrar rechazo de un conflicto.
4. Durante el intervalo, convertir en préstamo sin volver a ingresar titular/unidad.
5. Como titular, consultar el préstamo propio; no acceder a registros privados ajenos.
6. Como administrador, devolver e inspeccionar; comprobar estado y auditoría.
7. Recrear contenedores y comprobar que las operaciones permanecen.

No se declara certificación de carga ni compatibilidad probada en todos los SO.
Las verificaciones reales de Docker/navegador se realizan en Linux AMD64; quedan
pendientes pruebas en macOS/Windows/ARM64 y medición de carga con el volumen
institucional objetivo. No es un despliegue público de producción.
