# Informe de avance  del proyecto — 50 %

**Sistema de préstamos de bienes de la Escuela Profesional de Ciencia de la Computación**

| Dato | Descripción |
| --- | --- |
| Repositorio | [javierRock/TI_II](https://github.com/javierRock/TI_II) |
| Fecha de corte | 20 de octubre de 2026 |
| Rama de trabajo | `main` |
| Base del incremento | Revisión `d12309b` |
| Base de integración en main | Revisión `cccdd59` del repositorio original |
| Alcance del avance | Cinco de diez hitos de la planificación del proyecto |
| Estado | Núcleo funcional verificado en entorno de desarrollo |

## 1. Resumen del avance

El proyecto dispone de una aplicación web para administrar personas y cuentas,
catálogo de bienes, unidades de inventario, políticas de préstamo, reservas,
entregas, devoluciones e historial de operaciones. Su implementación utiliza
Node.js, Express y PostgreSQL, con una interfaz en HTML, CSS y JavaScript.

El incremento incorpora reservas de unidades por intervalo y su conversión en
préstamos. Se añaden controles de disponibilidad, ocupación simultánea, permisos,
transiciones de estado y conservación de los datos históricos. El flujo nuevo
está disponible tanto en la API como en la interfaz web.

El 50 % corresponde a cinco hitos de diez puntos cada uno sobre una planificación
de cien puntos. Es un indicador de alcance del plan de trabajo definido para este
corte. No representa cobertura de código ni cumplimiento del 50 % exacto de todos
los requisitos originales. La preparación para producción forma parte de una
etapa posterior.

## 2. Objetivos

### 2.1 Objetivo general

Consolidar una base funcional, estructurada y verificable para gestionar el núcleo
de préstamos y reservas, y continuar la implementación de los módulos pendientes.

### 2.2 Objetivos específicos

1. Mantener una estructura que separe presentación, coordinación de operaciones
   y acceso a datos.
2. Incorporar solicitudes y decisiones de reserva para unidades e intervalos concretos.
3. Impedir compromisos incompatibles y excesos de cupo mediante controles transaccionales.
4. Integrar la entrega desde reserva con el préstamo, inventario y auditoría.
5. Verificar los flujos incluidos mediante pruebas unitarias, de integración,
   concurrencia y navegador.
6. Documentar el alcance entregado, sus restricciones y la secuencia de continuación.

## 3. Alcance funcional consolidado

| Área | Implementación disponible | Aporte al proyecto |
| --- | --- | --- |
| Identidad y acceso | Personas, cuentas, inicio/cierre de sesión y permisos administrativos | Identifica al responsable de cada operación y controla el acceso |
| Vinculación académica | Perfiles manuales de estudiantes/docentes y planes de estudio | Permite habilitar solicitantes sin presumir una integración institucional |
| Catálogo e inventario | Fichas, unidades, códigos, accesorios, ubicación, mantenimiento y baja | Distingue la descripción del bien de cada ejemplar prestable |
| Políticas | Versiones generales/por rol, aprobación, cupos, plazos y modalidades | Aplica condiciones autorizadas y conserva las utilizadas en cada préstamo |
| Reservas | Solicitud propia, confirmación/rechazo, cancelación y vencimiento consultable | Organiza compromisos anticipados de uso de una unidad |
| Disponibilidad | Consulta por intervalo, estado físico, préstamos abiertos y reservas confirmadas | Reduce conflictos sin revelar información privada de otros titulares |
| Préstamos | Entrega directa o vinculada a reserva, vencimiento y responsabilidad del titular | Conecta la autorización con la ocupación real de la unidad |
| Devoluciones | Inspección de condición/accesorios y destino físico explícito | Impide que una unidad dañada o incompleta quede disponible automáticamente |
| Auditoría e historial | Registro de cambios, consulta administrativa y consulta de registros propios | Conserva trazabilidad de las operaciones incluidas |
| Interfaz web | Formularios, tablas y búsquedas paginadas según permisos | Permite operar los procesos desde el navegador |
| Entorno Docker y demostración | Configuración de contenedores y datos ficticios aislados ya presentes en main | Facilita preparar entornos de desarrollo y demostración |

Identidad, inventario, políticas, préstamos directos e interfaz ya existían en la
base de trabajo. Este incremento amplía su funcionamiento con reservas y añade
verificaciones, contratos y documentación de continuidad.

## 4. Implementaciones del incremento

### 4.1 Solicitud y gestión de reservas

Un docente o estudiante habilitado puede solicitar una unidad para un intervalo
futuro. La identidad se obtiene de la sesión y no se acepta que el cliente indique
otro titular. La solicitud valida perfil y política aplicable; queda pendiente de
decisión administrativa y todavía no compromete disponibilidad.

El administrador confirma o rechaza la solicitud. El rechazo exige motivo. Una
solicitud o confirmación vigente admite cancelación por su titular o por un
administrador, también con motivo. Si el intervalo termina sin entrega, el estado
efectivo se presenta como vencido a partir del reloj de PostgreSQL.

### 4.2 Disponibilidad, intervalos y cupos

Solo las reservas confirmadas bloquean intervalos. Se aplica la convención
`[inicio, fin)`, que permite comenzar un compromiso cuando termina otro.
PostgreSQL impide confirmar reservas incompatibles de la misma unidad.

El cupo se comprueba en los instantes en que puede aumentar la ocupación. Se
consideran los préstamos abiertos y las reservas confirmadas que coinciden en el
tiempo. Un préstamo vencido continúa abierto hasta su cierre real.

Se aplica un criterio conservador: una unidad con préstamo abierto no admite
confirmar otra reserva hasta que se registre su recepción, aunque la devolución
prevista fuera anterior al intervalo solicitado. La consulta de disponibilidad
informa el estado observado; la escritura vuelve a validar las condiciones.

### 4.3 Entrega vinculada a reserva

La entrega se registra durante el intervalo confirmado y mantiene el mismo titular,
unidad y modalidad. El vencimiento no puede superar el fin de la reserva.
El vínculo es opcional para conservar las entregas directas y es único para
impedir que una reserva produzca varios préstamos.

El registro del préstamo, la atención de la reserva, el cambio de inventario y
la auditoría se coordinan en una transacción. Una validación fallida revierte los
cambios relacionados.

### 4.4 Mantenimiento, baja e historial

Si una unidad pasa a mantenimiento o baja, se cancelan sus solicitudes y reservas
confirmadas no vencidas, con motivo y actor. La cancelación pertenece a la misma
transacción que el cambio de estado. Las condiciones de los préstamos anteriores
se conservan.

### 4.5 Interfaz y herramientas de verificación

Se incorporan las vistas **Mis reservas** y **Gestión de reservas**, consulta de
disponibilidad, decisiones administrativas y entrega asociada. La entrega recupera
titular/unidad de la reserva y mantiene la inspección y confirmación explícitas.

Se añaden una comprobación de sintaxis y un comando secuencial para ejecutar las
verificaciones, incluida la suite de demostración del repositorio original. La configuración de integración continua utiliza PostgreSQL 18
temporal y Playwright; su ejecución en GitHub continúa pendiente.

## 5. Tecnologías y estructura del software

| Área | Tecnología | Función |
| --- | --- | --- |
| Lenguaje y servidor | JavaScript, Node.js 22+ y Express 5 | Implementación de la API y servicio del frontend |
| Validación | Zod | Contratos y validación de entradas |
| Persistencia | PostgreSQL y controlador `pg` | Consultas parametrizadas, transacciones e integridad |
| Evolución del esquema | node-pg-migrate y SQL versionado | Aplicación ordenada de cambios de base de datos |
| Seguridad | Argon2id, sesiones, cookies HttpOnly y CSRF | Protección de credenciales, sesiones y escrituras |
| Interfaz | HTML5, CSS y módulos JavaScript | Presentación y operación desde el mismo origen |
| Pruebas | Node Test Runner y Playwright | Verificación de reglas, API, concurrencia y navegador |
| Integración continua | GitHub Actions | Configuración de comprobaciones automáticas |

El backend agrupa funcionalidades en módulos. Las rutas traducen HTTP y aplican
permisos; los esquemas validan entradas; los servicios coordinan casos de uso;
los repositorios acceden a PostgreSQL. Las reglas críticas se refuerzan en el motor.

La nueva migración añade `reservas`, la vista de su estado efectivo y el vínculo
opcional `prestamos.reserva_id`. El esquema queda con **13 tablas de aplicación,
tres vistas y cinco migraciones**. Los préstamos previos reciben el vínculo nulo,
conservando sus datos originales.

## 6. Verificación y evidencia

Los resultados siguientes corresponden a la verificación de la versión integrada en main,
con Node.js 24.19.0, PostgreSQL 18 en un contenedor temporal y Chromium/Playwright.
Se utilizaron roles de base de datos separados y datos ficticios en bases descartables.

| Comprobación | Resultado registrado |
| --- | --- |
| Sintaxis JavaScript | 94 archivos comprobados |
| Pruebas unitarias | 32 aprobadas |
| Integración y concurrencia | 63 casos distintos aprobados |
| Pruebas de demostración | 7 aprobadas, incluidos subcasos |
| Pruebas de navegador | 11 aprobadas |
| Total de casos comprobados | 113 aprobados |
| Migración desde cero | Cinco revisiones aplicadas correctamente |
| Actualización desde la revisión anterior | Préstamo, condiciones, fechas y estado de unidad conservados |

La suite completa de integración y concurrencia incluye los casos de ocupación
máxima e intervalos adyacentes. La evidencia inicial del incremento y la verificación
posterior de integración están registradas en
[verificacion-50.md](verificacion-50.md).

Las pruebas comprobaron privacidad entre titulares, sesión y permisos, CSRF,
conflictos simultáneos, cupos, transiciones, auditoría y reversión de operaciones
fallidas. En el navegador se verificó la solicitud, confirmación y entrega desde reserva.

## 7. Medición del avance y trabajo pendiente

| Hito | Entregable | Peso | Puntos alcanzados en este plan |
| --- | --- | ---: | ---: |
| H1 | Base técnica, configuración, sesiones y seguridad | 10 | 10 |
| H2 | Personas, perfiles manuales, catálogo e inventario | 10 | 10 |
| H3 | Políticas generales/por rol, préstamo directo y devolución | 10 | 10 |
| H4 | Reservas, disponibilidad y conversión en préstamo | 10 | 10 |
| H5 | Interfaz del núcleo, estructura, verificación local y documentación | 10 | 10 |
| H6 | Renovaciones y políticas por tipo de bien | 10 | 0 |
| H7 | Garantías y ciclo de custodia/liberación | 10 | 0 |
| H8 | Incidencias y cierre por pérdida | 10 | 0 |
| H9 | Sanciones, apelaciones, cumplimiento y bloqueos | 10 | 0 |
| H10 | Reportes ampliados, integración institucional y operación productiva | 10 | 0 |
| **Total** | **Plan de trabajo del proyecto** | **100** | **50** |

H5 comprende la verificación local y la preparación de CI. La ejecución remota,
la instalación limpia de dependencias, las pruebas de carga y el despliegue
productivo no se presentan como resultados verificados de este corte.

## 8. Relación con los requisitos

| Requisitos de referencia | Cobertura actual | Aspectos por completar |
| --- | --- | --- |
| RF-001 a RF-004 y RF-027 | Personas, cuentas, perfiles y autenticación | Delegación administrativa por HTTP e integración académica |
| RF-005 a RF-008 y RF-029 | Catálogo, inventario, estados y disponibilidad por intervalo | Cierre por pérdida vinculado a una incidencia |
| RF-009 y RF-010 | Versiones generales/por rol y condiciones históricas | Políticas por tipo y configuración de los módulos futuros |
| RF-011 a RF-013 | Solicitud, decisión, cancelación, vencimiento y entrega desde reserva | Comprobación de bloqueos cuando exista el módulo de sanciones |
| RF-014 a RF-017 | Entrega, cupo, vencimiento, devolución e inspección | Garantías y consecuencias económicas autorizadas |
| RF-018 a RF-024, RF-028 y RF-030 | Módulos previstos en la planificación | Garantías, sanciones, incidencias, pérdida y renovaciones |
| RF-025, RF-026 y RF-031 | Auditoría y consultas del núcleo implementado | Reportes y antecedentes de los módulos pendientes |

Esta relación distingue cobertura parcial y funcionalidad pendiente. No afirma
cumplimiento completo de todos los requisitos enumerados.

## 9. Limitaciones y condiciones de continuidad

- La información académica se registra manualmente; no hay sincronización institucional.
- Las reservas se refieren a una unidad concreta; no existe lista de espera.
- Las políticas con garantías, renovaciones o tarifas no soportadas permanecen restringidas.
- No se implementaron recuperación de contraseñas, delegación administrativa por HTTP,
  cobros ni notificaciones automáticas.
- No se midieron cobertura de código, rendimiento bajo carga o disponibilidad productiva.
- La ejecución remota de CI y una instalación limpia con `npm ci` siguen pendientes.
- La operación institucional requiere aprobación de políticas, configuración HTTPS,
  observabilidad y un ensayo de recuperación apropiado para el despliegue previsto.

## 10. Plan de continuación

1. Revisar con los responsables del servicio los perfiles, permisos y parámetros reales.
2. Comprobar la instalación reproducible y la CI en el repositorio remoto.
3. Implementar H6 con renovaciones, historial de vencimientos y políticas por tipo.
4. Incorporar garantías, incidencias y sanciones en hitos separados, conservando
   integridad, permisos y trazabilidad.
5. Completar reportes y preparación de operación con mediciones y pruebas específicas.

## 11. Documentación de respaldo

- [Detalle de implementaciones, propósitos y alcance](informe-implementaciones-50.md)
- [Planificación y trazabilidad del corte](avance-50.md)
- [Arquitectura del sistema](arquitectura.md)
- [Modelo de datos](modelo-datos.md)
- [Contrato y reglas de reservas](reservas.md)
- [Evidencia de verificación](verificacion-50.md)
- [Guía de desarrollo](desarrollo.md)
- [Requisitos funcionales originales](../assets/Analisis_Requisitos/secciones/03_requisitos_funcionales.tex)
