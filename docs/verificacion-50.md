# Evidencia de verificación del corte 50 %

Fecha: 20 de octubre de 2026. Base del incremento: commit `d12309b`.

## Entorno utilizado

- Node.js 24.19.0, compatible con el mínimo Node 22 declarado por el proyecto.
- PostgreSQL 18 en un contenedor exclusivo y descartable, sin volumen persistente.
- Puerto local separado y bases de verificación creadas para este trabajo.
- Rol propietario de migraciones y rol API restringido, distintos del administrador.
- Dependencias previamente instaladas de TI_II; Playwright con Chromium local.

Las fixtures y políticas ficticias se usaron únicamente en las bases descartables.
No se aplicaron migraciones ni se cargaron datos de prueba en una base institucional.

## Resultados iniciales del incremento

| Comprobación | Resultado observado |
| --- | --- |
| Sintaxis de JavaScript | 84 archivos comprobados, sin errores |
| Pruebas unitarias | 26 aprobadas |
| Integración y concurrencia | 62 aprobadas en la suite completa; una prueba adicional aprobada de ocupación máxima/intervalos adyacentes |
| Navegador | 11 aprobadas con Chromium |
| Total de casos distintos comprobados | 100 aprobados; sin omisiones en las suites ejecutadas |
| Migración desde cero | Cinco revisiones aplicadas correctamente sobre base nueva |
| Actualización desde la revisión `1791244800003` | Conserva un préstamo abierto, sus campos/condiciones/fechas y el estado de su unidad; añade `reserva_id=NULL` |
| Revisión del diff | Sin errores de espacios con `git diff --check` |

La prueba adicional de ocupación máxima se ejecutó con las otras cuatro pruebas de
integridad de reservas: cinco de cinco aprobadas. Las reservas adyacentes de esa prueba
usan precisión de milisegundos consistente para conservar la frontera exacta al pasar
de PostgreSQL a JavaScript. Las restricciones del motor mantienen sus instantes originales.

## Comportamiento nuevo comprobado

- Sesión/CSRF obligatorios y permisos administrativos en decisiones.
- Identidad del titular tomada de sesión; consulta/cancelación ajena devuelve 404.
- Intervalos con zona horaria, inicio futuro y fin posterior; originales inmutables.
- Solo confirmar bloquea; conflicto rechazado, adyacencia permitida y cancelación libera.
- Cupo comprobado por ocupación máxima, no por sumar reservas que no coinciden entre sí.
- Confirmaciones simultáneas de una unidad producen un único compromiso confirmado.
- Confirmaciones simultáneas en unidades distintas respetan el cupo del mismo titular.
- Entrega y confirmación simultáneas no crean compromisos incompatibles.
- Préstamo abierto impide confirmar otra reserva de esa unidad hasta su recepción real.
- Entrega asociada conserva identidad/unidad/modalidad/intervalo, consume reserva y audita.
- Un rechazo de entrega no deja cambios parciales en reserva ni inventario.
- Mantenimiento cancela reservas afectadas con motivo/actor en la misma transacción.
- Vencimiento de reserva se deriva del reloj sin modificar el historial ni liberar un préstamo.
- Solicitud, consulta de disponibilidad, confirmación y entrega asociada desde la interfaz.

## Límites de la evidencia

No se midió cobertura de código, carga, disponibilidad productiva ni integraciones
institucionales. El workflow de GitHub Actions queda preparado y no se ha publicado
ni ejecutado remotamente. No se realizó una instalación limpia `npm ci` en este entorno;
la verificación utilizó las dependencias existentes, mientras la CI define ese paso.
Los respaldos/restauración productiva requieren su ensayo operativo posterior.

Para repetir las suites: [desarrollo.md](desarrollo.md). Para interpretar el porcentaje:
[avance-50.md](avance-50.md).

## Verificación de integración en main

Se integró el avance funcional con la revisión `cccdd59` del repositorio original
`javierRock/TI_II`, conservando sus cambios de Docker, demostración y organización
de archivos. La publicación se prepara sobre `main` con ambas líneas de trabajo.

| Comprobación de la versión integrada | Resultado |
| --- | --- |
| Sintaxis JavaScript | 94 archivos comprobados |
| Pruebas unitarias | 32 aprobadas |
| Integración y concurrencia | 63 aprobadas en la suite completa |
| Demostración | 7 aprobadas, incluidos subcasos de carga e idempotencia |
| Navegador | 11 aprobadas |
| Total | 113 casos aprobados; cero fallos y cero omisiones |
| Migraciones | Cinco revisiones aplicadas en bases nuevas de verificación |

Se utilizó PostgreSQL 18 en un contenedor temporal sin volumen persistente,
Node.js 24.19.0 y Chromium. Los comandos recibieron conexiones de verificación
separadas de la configuración privada de desarrollo. Las pruebas de demostración
crearon y retiraron únicamente sus bases temporales. No se cargaron fixtures en
bases institucionales ni se reconstruyó la imagen completa de la aplicación.

El comando `npm run verify` incluye ahora también la suite de demostración.
Estos resultados actualizan la evidencia funcional del informe para la integración;
la sección anterior conserva el registro de la verificación inicial.
