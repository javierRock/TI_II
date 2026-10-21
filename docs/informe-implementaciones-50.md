# Detalle técnico de las implementaciones del corte 50 %

- **Fecha:** 20 de octubre de 2026.
- **Proyecto:** sistema de préstamos de bienes de la Escuela.
- **Repositorio:** [javierRock/TI_II](https://github.com/javierRock/TI_II)
- **Rama del incremento:** `main`.
- **Punto de partida:** commit `d12309b`.

Este documento es el anexo técnico del [informe de avance del 50 %](informe-avance-50.md).
Describe los cambios, sus propósitos y los límites de cada implementación.

## 1. Propósito del trabajo

El objetivo de este incremento es dejar una base funcional y organizada para continuar
el desarrollo de TI_II. Se amplía el préstamo directo con reservas de unidades por
intervalo, conservando la separación entre interfaz, API, reglas y persistencia.

El corte se ubica en el 50 % de la planificación definida para este repositorio:
cinco de diez hitos, cada uno con un peso de diez puntos. Es una referencia para
organizar el alcance; no equivale a la mitad exacta de los requisitos originales,
a cobertura de pruebas ni a una certificación de preparación para producción.

## 2. Base que ya existía

Antes de este incremento el proyecto ya contaba con los siguientes componentes.
Se conservaron y se incluyeron en la verificación de regresión.

| Componente existente | Propósito | Alcance que conserva |
| --- | --- | --- |
| Backend Node.js y Express | Atender las operaciones del sistema mediante HTTP | API con validación Zod y separación en módulos |
| PostgreSQL y migraciones | Mantener datos e integridad de forma versionada | Roles separados para aplicación, migraciones y administración |
| Personas, cuentas y perfiles | Identificar y habilitar solicitantes y responsables | Estudiantes/docentes con perfiles manuales y atribución administrativa diferenciada |
| Catálogo e inventario | Identificar bienes y unidades físicas | Tipos permitidos, ubicación, accesorios, disponibilidad, mantenimiento y baja |
| Políticas versionadas | Aplicar cupos, plazos y modalidades autorizados | Políticas generales/por rol e historial de condiciones del préstamo |
| Préstamos y devoluciones | Registrar responsabilidad sobre una unidad | Entrega directa, vencimiento y devolución con inspección explícita |
| Seguridad y auditoría | Controlar acceso y conservar trazabilidad | Argon2id, sesiones con cookie HttpOnly, CSRF, permisos e historial |
| Interfaz HTML/CSS/JavaScript | Operar los procesos desde el navegador | Frontend servido por Express desde el mismo origen |

Estos elementos constituyen el punto de partida del incremento. Se conserva la
plataforma Node.js/Express/PostgreSQL y se amplía el núcleo operativo del servicio.
La integración con `cccdd59` conserva también la configuración Docker, demostración
y reorganización de requisitos que ya estaban en main del repositorio original.

## 3. Implementaciones añadidas y sus propósitos

| Implementación nueva | Propósito | Alcance entregado |
| --- | --- | --- |
| Módulo de reservas | Organizar solicitudes anticipadas de bienes | Solicitar una unidad concreta para un inicio y fin; consultar reservas propias y administrativas |
| Decisión administrativa | Distinguir una solicitud de un compromiso aprobado | Confirmación o rechazo por administrador; motivo obligatorio de rechazo |
| Cancelación con motivo | Liberar compromisos que ya no se utilizarán | Titular o administrador puede cancelar una reserva vigente solicitada/confirmada |
| Disponibilidad por intervalo | Comprobar si una unidad tiene compromisos incompatibles | Consulta de estado físico, préstamos abiertos y reservas confirmadas, sin mostrar titulares ajenos |
| Protección de cruces | Evitar prometer la misma unidad en horarios coincidentes | Restricción PostgreSQL para reservas confirmadas; intervalos `[inicio,fin)` permiten adyacencia |
| Cupo por instante | Evitar exceder la capacidad permitida del solicitante | Cuenta préstamos abiertos y ocupación simultánea de reservas; no suma como simultáneas reservas que ocurren en momentos distintos |
| Entrega desde reserva | Convertir una confirmación en un préstamo real | Mantiene titular, unidad y modalidad; exige entrega durante el intervalo y vencimiento hasta el fin reservado |
| Vínculo único reserva-préstamo | Evitar que una reserva genere varias entregas | Campo opcional y único `reserva_id` en préstamos; conserva el historial previo |
| Operación transaccional | Confirmar o revertir juntos los cambios relacionados | Préstamo, atención de reserva, estado físico y auditoría participan de la misma transacción |
| Vencimiento consultable | Mostrar reservas que terminaron sin entrega | Estado efectivo calculado por el reloj de PostgreSQL, conservando la decisión histórica |
| Cancelación por mantenimiento/baja | Retirar compromisos que la unidad ya no puede cumplir | Cancela solicitudes y confirmaciones no vencidas de la unidad, con motivo y actor, en la misma transacción |
| Pantallas de reservas | Dar acceso al nuevo flujo desde la web | Mis reservas, gestión administrativa, consulta de intervalo y entrega asociada |
| Comprobación de sintaxis | Detectar errores JavaScript antes de continuar | Revisión de código, scripts, migraciones y pruebas mediante `npm run check` |
| Comando de verificación | Facilitar la comprobación del incremento | `npm run verify` encadena sintaxis, pruebas unitarias, integración/concurrencia y navegador |
| Configuración de CI | Preparar verificaciones automáticas en GitHub | Workflow con PostgreSQL 18 temporal, instalación de dependencias y Playwright |
| Documentación de continuidad | Explicar decisiones, contratos y trabajo pendiente | Plan de alcance, API de reservas, guía de desarrollo y evidencia de verificación |

## 4. Organización técnica del incremento

El módulo nuevo sigue el patrón de desarrollo existente:

```text
backend/src/modules/reservas/
  reservas.routes.js       Traducción HTTP, autenticación y permisos
  reservas.schemas.js      Contratos de entrada validados con Zod
  reservas.service.js      Coordinación de casos de uso y transacciones
  reservas.repository.js   Consultas SQL parametrizadas

backend/db/migrations/
  1791244800004_reservas.cjs
backend/db/sql/
  005_reservas.sql

frontend/js/views/
  reservations.js          Solicitudes y gestión de reservas
  loans.js                 Entrega vinculada a una reserva
```

La base pasa de 12 a 13 tablas de aplicación y de dos a tres vistas. La migración
es aditiva: los préstamos anteriores conservan sus campos y reciben
`reserva_id = NULL`. No se reescriben revisiones ya aplicadas ni las condiciones
históricas de los préstamos.

La interfaz muestra las opciones pertinentes, pero el servidor y PostgreSQL
mantienen la autoridad sobre permisos, cupos, cruces y transiciones de estado.

## 5. Flujo de uso que queda disponible

1. El responsable registra y habilita las cuentas, perfiles, unidades y políticas
   reales que corresponden al servicio.
2. Un docente o estudiante habilitado consulta disponibilidad y solicita una
   unidad para un intervalo futuro, indicando modalidad y observaciones opcionales.
3. La solicitud queda pendiente. El administrador puede confirmarla o rechazarla;
   solo la confirmación compromete el intervalo.
4. Durante el intervalo confirmado, el administrador registra la entrega desde
   esa reserva, inspeccionando condición y accesorios.
5. El sistema vuelve a validar elegibilidad, disponibilidad, política, cupo e
   intervalo. Si todo es válido, registra el préstamo y atiende la reserva juntos.
6. El administrador registra la devolución real y su inspección. Un daño o faltante
   puede dejar la unidad en mantenimiento o baja y cancelar reservas afectadas.
7. El titular consulta sus propios registros y el administrador consulta el historial.

La consulta previa de disponibilidad no garantiza por sí sola la confirmación:
las condiciones se vuelven a comprobar al escribir. Una unidad con préstamo abierto
no admite confirmar otra reserva hasta su recepción real, incluso si el vencimiento
previsto ya pasó. Este criterio es conservador y evita prometer devoluciones futuras.

## 6. Verificación realizada

La verificación de integración con main utilizó Node.js 24.19.0, PostgreSQL 18
y Chromium/Playwright. Se utilizaron bases descartables,
roles separados y dependencias previamente instaladas.

| Comprobación | Evidencia registrada |
| --- | --- |
| Sintaxis | 94 archivos JavaScript comprobados |
| Pruebas unitarias | 32 aprobadas |
| Integración y concurrencia | 63 casos aprobados en la suite completa |
| Demostración | 7 aprobadas, incluidos subcasos |
| Navegador | 11 aprobadas, incluido el flujo de reserva a entrega |
| Total | 113 casos aprobados |
| Migración desde cero | Cinco revisiones aplicadas correctamente |
| Actualización desde la revisión anterior | Préstamo abierto, condiciones, fechas y estado de unidad conservados |

Las comprobaciones incluyen privacidad entre titulares, permisos, CSRF, intervalos,
cupos simultáneos, carreras entre operaciones, auditoría y reversión de cambios fallidos.

No se ejecutó una instalación limpia `npm ci` ni la CI remota en este entorno.
Tampoco se midieron cobertura de código, carga o disponibilidad productiva.
La evidencia detallada está en [verificacion-50.md](verificacion-50.md).

## 7. Alcance del 50 % y próximos hitos

| Hito | Entregable | Estado |
| --- | --- | --- |
| H1 | Base técnica, configuración, sesiones y seguridad | Incluido en este corte |
| H2 | Personas, perfiles manuales, catálogo e inventario | Incluido en este corte |
| H3 | Políticas versionadas, préstamos directos y devoluciones | Incluido dentro de las restricciones actuales |
| H4 | Reservas, disponibilidad y conversión en préstamo | Incorporado en este incremento |
| H5 | Interfaz del núcleo, estructura, verificaciones y documentación | Incluido; ejecución remota de CI pendiente |
| H6 | Renovaciones y políticas por tipo de bien | Pendiente |
| H7 | Garantías y su ciclo de custodia/liberación | Pendiente |
| H8 | Incidencias y cierre por pérdida | Pendiente |
| H9 | Sanciones, apelaciones, cumplimiento y bloqueos | Pendiente |
| H10 | Reportes ampliados, integración institucional y operación productiva | Pendiente |

La atribución administrativa por HTTP, recuperación de contraseñas, pagos,
notificaciones automáticas y lista de espera tampoco están implementadas en este corte.
Las condiciones institucionales requieren aprobación real antes de operar el servicio.

## 8. Control de versiones del incremento

| Etapa | Responsabilidad | Contenido |
| --- | --- | --- |
| Backend | Backend de reservas | Migración, API, integridad y pruebas de reglas/concurrencia |
| Interfaz | Interfaz web | Reservas, entrega asociada y prueba del recorrido en navegador |
| Calidad | Herramientas de calidad | Comprobación de sintaxis, verificación secuencial y configuración CI |
| Documentación | Documentación del corte | Contratos, planificación, guías y evidencia funcional |

Las etapas separan cambios por responsabilidad para facilitar revisión,
seguimiento y continuación del desarrollo. El informe de avance consolida el estado
funcional descrito por esas etapas.

## 9. Continuar el trabajo

Para usar las funciones nuevas en otra base de desarrollo es necesario aplicar las
migraciones con su conexión de propietario; la verificación temporal no actualiza
las bases personales o institucionales.

Desde `backend/`, con dependencias, PostgreSQL y variables de entorno configurados:

```sh
npm ci
npm run db:migrate
npm run dev
```

Para comprobar cambios posteriores, preparar una base de pruebas separada y Chromium,
y ejecutar `npm run verify`. El siguiente hito previsto es H6: renovaciones y
políticas por tipo, conservando el historial y las reglas de concurrencia existentes.

Documentos de apoyo:

- [Informe de avance del 50 %](informe-avance-50.md)
- [Índice de documentación](README.md)
- [Plan y trazabilidad del corte 50 %](avance-50.md)
- [Contrato y reglas de reservas](reservas.md)
- [Guía de desarrollo](desarrollo.md)
- [Resultados de verificación](verificacion-50.md)
