# Verificación manual y demostración

Esta entrega no incluye pruebas automatizadas. Las comprobaciones siguientes
generan historial real: realizarlas únicamente con datos de demostración.

## Antes de comenzar

Desde `infra/docker/`, ejecutar `docker compose ps -a`: MySQL y la aplicación
deben estar saludables, y `preparar-db` debe haber terminado con código 0.
Abrir el origen definido en `infra/docker/.env`. Los controles `healthcheck.test`
de Compose comprueban la salud de los servicios; no son suites de pruebas.

## Recorrido de los módulos

1. Ingresar como `demo.admin`, comprobar personas, cuentas y perfiles.
2. Consultar fichas y unidades. Comprobar búsquedas por código, categoría y fechas.
3. Ingresar como `demo.estudiante1` y solicitar una reserva futura.
4. Como administrador, confirmar la reserva y comprobar que la unidad aparece
   ocupada en ese intervalo, sin quedar físicamente prestada todavía.
5. Intentar una reserva solapada: debe rechazarse cuando exista conflicto.
   Un intervalo que comienza exactamente al terminar el anterior no se solapa.
6. Durante el intervalo confirmado, convertir la reserva en préstamo. El plazo
   no puede superar su fin y la reserva no puede convertirse dos veces.
7. Como titular, consultar el préstamo en la sección propia. Un solicitante no
   debe poder entrar a la gestión administrativa ni a registros privados ajenos.
8. Como administrador, registrar devolución e inspección. Si hay daños o faltan
   accesorios, no declarar disponible la unidad: enviarla a mantenimiento o baja.
9. Consultar el historial. Los cambios deben conservar responsable y motivos.
10. Reiniciar los servicios sin borrar volúmenes y verificar que los datos siguen
    presentes. No usar `docker compose down -v` para reiniciar.

## DBeaver

Seguir [la guía de conexión](mysql-workbench.md). El editor puede consultar datos
y editar columnas descriptivas autorizadas, pero no alterar reservas, préstamos,
sesiones o auditoría. Para generar el diagrama, abrir el esquema en la vista ER.

La verificación manual no certifica concurrencia, rendimiento ni compatibilidad
en todos los sistemas operativos. El sistema es una entrega académica local,
no un despliegue público de producción.
