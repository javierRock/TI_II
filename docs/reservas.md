# Reservas de unidades e intervalos

## Flujo e invariantes

1. Un docente/estudiante con cuenta y perfil habilitados solicita una unidad concreta,
   modalidad e intervalo futuro. Se comprueba una política aprobada aplicable al inicio
   y su plazo/modalidad. La identidad viene de la sesión.
2. La solicitud está `solicitada`; todavía no bloquea disponibilidad.
3. El administrador confirma o rechaza. Confirmar vuelve a validar perfil, política,
   estado físico, préstamo abierto, exclusión de intervalos y cupo. Rechazar exige motivo.
4. Titular o administrador pueden cancelar una solicitud/confirmación vigente con motivo.
5. Durante el intervalo confirmado el administrador registra la entrega desde la reserva.
   No se reingresa titular/unidad; el servidor vuelve a validarlos. Solo se permite un
   préstamo por reserva, su vencimiento no supera el fin y la reserva pasa a `atendida`
   junto con el préstamo, inventario y auditoría en una transacción.
6. Si llega el fin sin entrega, `estado_actual` pasa a `vencida` por consulta del reloj
   de PostgreSQL. El estado persistido conserva la última decisión. No hace falta cron.

Los intervalos son `[inicio,fin)`: un compromiso puede comenzar cuando otro termina.
El estado físico de la unidad no cambia por reservarla. Las reservas confirmadas
bloquean entregas incompatibles y se cuentan para el cupo del titular en los momentos
en que aumenta la ocupación. Un préstamo abierto cuenta hasta la recepción real.

Se aplica un criterio conservador: no se confirma una reserva de una unidad mientras
esta tenga un préstamo abierto, aunque su vencimiento previsto sea anterior al intervalo
solicitado. La solicitud puede quedar pendiente. Esto evita prometer devoluciones futuras.

Una transición de unidad a mantenimiento o baja cancela las reservas no vencidas
solicitadas/confirmadas de esa unidad con motivo y actor. La cancelación pertenece a la
misma transacción. Si falla, se revierte también la transición de inventario/devolución.
Las escrituras directas de mantenimiento con reservas requieren contexto de actor válido.

## API añadida

Todas las rutas están bajo `/api/v1`, requieren sesión, y las escrituras requieren CSRF.

| Método | Ruta | Permiso / uso |
| --- | --- | --- |
| GET | `/reservas/mias` | Listado propio paginado |
| GET | `/reservas` | Listado administrativo paginado |
| GET | `/reservas/:id` | Titular o administrador; ajenos reciben 404 |
| GET | `/reservas/disponibilidad?unidad_id=...&inicio=...&fin=...` | Disponibilidad física; no expone datos de terceros ni garantiza cupo/política |
| POST | `/reservas` | Solicitud propia; no acepta `solicitante_id` ni estado |
| POST | `/reservas/:id/confirmar` | Administrador |
| POST | `/reservas/:id/rechazar` | Administrador, con motivo |
| POST | `/reservas/:id/cancelar` | Titular/admin, con motivo |

Los listados aceptan `pagina`, `limite`, `estado` y `unidad_id`. La respuesta mantiene
`datos`, `total`, `pagina` y `limite`; cada registro incluye `estado_actual` y `prestamo_id`.

Ejemplo de solicitud (identificadores reales y fechas futuras):

```json
{
  "unidad_id": "123",
  "inicio": "2027-01-10T08:00:00-05:00",
  "fin": "2027-01-10T09:00:00-05:00",
  "modalidad": "retiro",
  "observaciones": "Uso previsto en actividad académica",
  "confirmar": true
}
```

Confirmación: `{"confirmar":true}`. Rechazo/cancelación añade `motivo` no vacío.
En `POST /prestamos`, el campo opcional `reserva_id` vincula la entrega. Su ausencia
mantiene la entrega directa, sujeta a los compromisos confirmados.

El reloj del servidor decide vigencia, no el del navegador. Las consultas no reservan
recursos: una carrera entre consulta y escritura puede producir 409. El frontend no
reintenta automáticamente. Repetir una confirmación idéntica devuelve su estado actual;
repetir una entrega no crea otro préstamo por la restricción única del vínculo.

## Estructura

`routes` autentica/autoriza y traduce HTTP; `schemas` valida entradas; `service` coordina
la transacción con revalidación de sesión; `repository` usa SQL parametrizado.
PostgreSQL repite invariantes críticas para proteger escrituras sin pasar por la API.
Los bloqueos serializan cuentas/unidad; una exclusión GiST protege el intervalo.
Conflictos de bloqueo o integridad se traducen a 409 y revierten todos los cambios.

No hay renovaciones, garantías, sanciones ni prioridad/lista de espera en este corte.
