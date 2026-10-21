# Corte de desarrollo del 50 %

Fecha del corte: 20 de octubre de 2026. Repositorio: **TI_II**.
Base revisada: commit `d12309b`; rama local de trabajo `main`.

Este corte deja una aplicación web operativa para el núcleo de préstamos y reservas,
con separación de responsabilidades, migraciones y pruebas. El 50 % corresponde a
los primeros cinco hitos de la planificación siguiente. Es una estimación de alcance
propuesta para organizar el desarrollo; no representa cobertura de pruebas, porcentaje
exacto de los 31 requisitos ni preparación productiva.

## Plan completo y criterio del porcentaje

Cada hito tiene un peso de 10 puntos. Los primeros cinco forman el corte actual
(50 de 100 puntos); los otros cinco conservan trabajo real por implementar.

| Hito | Alcance | Puntos | Estado en este corte |
| --- | --- | ---: | --- |
| H1 | Base Node/Express/PostgreSQL, configuración validada, roles separados, sesiones y CSRF | 10 | Implementado; se conserva y verifica la base existente |
| H2 | Personas, cuentas/perfiles manuales, planes y catálogo/inventario con permisos | 10 | Implementado; se conserva y verifica la base existente |
| H3 | Políticas generales/por rol versionadas; entrega directa, devolución inspeccionada, vencimiento e historial | 10 | Implementado dentro de las restricciones actuales |
| H4 | Reserva de unidad/intervalo, disponibilidad, decisión/cancelación, entrega vinculada y auditoría | 10 | Incorporado en este incremento, con interfaz y protección en PostgreSQL |
| H5 | Interfaz del núcleo, separación por módulos, verificación local reproducible y documentación del corte | 10 | Implementado y verificado localmente; workflow CI preparado, ejecución remota pendiente |
| H6 | Renovaciones con historial y políticas por tipo de bien; ampliar configuración avanzada | 10 | Pendiente |
| H7 | Garantías, custodia y liberación según política aprobada | 10 | Pendiente |
| H8 | Incidencias y cierre por pérdida con conservación de historial | 10 | Pendiente |
| H9 | Sanciones, apelaciones, cumplimiento y bloqueos autorizados | 10 | Pendiente |
| H10 | Reportes ampliados, integración institucional acordada y preparación de operación productiva | 10 | Pendiente |

H5 no exige que GitHub Actions ya haya corrido: el resultado confirmado es local.
La validación remota será un requisito de publicación del siguiente incremento.
La estabilidad aquí significa que los flujos incluidos pasan las comprobaciones
registradas en [verificacion-50.md](verificacion-50.md), con los límites indicados.

## Qué se añade sobre la base existente

- Módulo `reservas` con rutas HTTP, esquemas Zod, servicio y repositorio.
- Una migración aditiva: tabla de reservas, vínculo opcional desde el préstamo,
  exclusión de intervalos confirmados, reglas de cupo y auditoría.
- Disponibilidad por intervalo sin revelar quién tiene otras reservas/préstamos.
- Solicitud propia, confirmación/rechazo administrativo y cancelación por titular/admin.
- Entrega desde reserva: misma unidad, titular y modalidad; durante el intervalo,
  vencimiento hasta el fin reservado y consumo atómico de la reserva.
- Cancelación auditada de compromisos afectados por mantenimiento o baja.
- Vistas web de reservas y entrega asociada, comprobación de sintaxis y workflow CI.

## Trazabilidad con los requisitos

La referencia es `assets/Analisis_Requisitos/secciones/03_requisitos_funcionales.tex`.

| Requisitos | Cobertura del corte | Límites |
| --- | --- | --- |
| RF-001 a RF-004, RF-027 | Personas, cuentas, perfiles y autenticación | Perfiles manuales; delegación administrativa por HTTP pendiente |
| RF-005 a RF-008, RF-029 | Catálogo, unidades, estados y disponibilidad por intervalo | Cierre por pérdida pendiente; no hay disponibilidad especulativa mientras un préstamo siga abierto |
| RF-009 y RF-010 | Políticas general/rol, versiones, aprobación y condiciones históricas | Prioridad por tipo, garantías, tarifas y renovaciones siguen restringidas |
| RF-011 a RF-013 | Solicitud, decisión, cancelación, vencimiento y conversión en préstamo | No hay módulo de sanciones/bloqueos; se trabaja con una unidad concreta, sin lista de espera |
| RF-014 a RF-017 | Entrega, cupo, vencimiento, devolución e inspección | No gestiona garantías ni cobros; una pérdida requiere el próximo módulo |
| RF-018 a RF-024, RF-028, RF-030 | Funciones futuras | Garantías, sanciones, incidencias, pérdidas y renovaciones pendientes |
| RF-025, RF-026, RF-031 | Auditoría y listados propios/administrativos del núcleo | Reportes y antecedentes de módulos futuros pendientes |

## Condiciones para el siguiente incremento

1. Confirmar con el responsable de la Escuela las políticas y permisos reales.
2. Revisar este corte antes de publicarlo y comprobar la CI en GitHub.
3. Implementar H6 con una migración nueva, conservando condiciones históricas.
4. Mantener pruebas de cupo, intervalos, permisos y rollback en cada módulo nuevo.
5. Completar en H10 observabilidad, restauración ensayada, carga y despliegue HTTPS.

La planificación corresponde al alcance de TI_II y permite seguir su evolución
por hitos verificables. El [informe de avance](informe-avance-50.md) consolida el
estado funcional, las evidencias y los pendientes del corte.
