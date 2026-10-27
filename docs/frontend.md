# Interfaz web

HTML5, CSS y JavaScript nativo con módulos. Express sirve únicamente `frontend/`.
Abrir el origen APP_ORIGIN, no index.html como archivo local ni un Live Server.

## Solicitantes

Catálogo filtrado/paginado, búsqueda de unidades por intervalo, reservas propias,
solicitud y cancelación, préstamos propios e historial. Una reserva pendiente
no bloquea una unidad. Confirmación no evita revalidar condiciones en la entrega.

## Administrador

Personas, cuentas, perfiles, planes, fichas/unidades, políticas, reservas de todos,
confirmación/rechazo/cancelación, conversión en préstamo, entrega directa,
devolución inspeccionada y consulta de auditoría.

La conversión solo ocurre durante el intervalo confirmado y no puede superar
su fin. Rechazar y cancelar requieren motivo. Una devolución no apta exige
mantenimiento o baja y cancela las reservas afectadas.

El servidor valida permisos por registro, plazos, cupo y concurrencia; ocultar un
botón no es un control de seguridad. Las contraseñas no se guardan en localStorage.
La cookie es HttpOnly y CSRF se conserva solo en memoria. Los datos se insertan con
textContent, nunca HTML arbitrario. Escrituras sin reintentos automáticos y botones
bloqueados mientras se envían; los conflictos devuelven un mensaje explicativo.

Los campos de fecha indican hora local del navegador y se convierten a ISO con
zona; la base mantiene UTC y los registros se muestran en America/Lima. La interfaz se adapta a móvil y conserva etiquetas,
foco visible y navegación por teclado. Esto no constituye una certificación WCAG.
