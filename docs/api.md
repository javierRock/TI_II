# API /api/v1

JSON, autenticación con cookie HttpOnly. Obtener CSRF con login o `/auth/me` y
enviar `X-CSRF-Token` en escrituras. Los IDs son cadenas, no números JavaScript.
La API valida propiedades desconocidas. Errores: 400 datos, 401 sesión, 403 permiso,
404 inexistente/ajeno, 409 conflicto, 429 intentos de acceso excesivos.

| Grupo | Operaciones |
| --- | --- |
| Salud | GET /health |
| Acceso | POST /auth/login, POST /auth/logout, GET /auth/me |
| Personas | GET/POST /personas; GET/PATCH /personas/:id; PATCH /personas/:id/estado |
| Cuentas | POST/PATCH /personas/:id/cuenta; PUT /personas/:id/perfil |
| Planes | GET/POST /planes-estudio |
| Catálogo | GET /catalogo/tipos, /catalogo/bienes, /catalogo/bienes/:id, /catalogo/unidades |
| Inventario | POST /inventario/bienes, PATCH /inventario/bienes/:id; POST /inventario/unidades; GET/PATCH /inventario/unidades/:id; PATCH /inventario/unidades/:id/estado |
| Políticas | GET/POST /politicas; PATCH /politicas/:id; POST /politicas/:id/aprobar |
| Préstamos | GET /prestamos (admin), /prestamos/mios, /prestamos/:id; POST /prestamos; POST /prestamos/:id/devolucion |
| Reservas | GET /reservas (admin), /reservas/mias; POST /reservas |
| Decisión | POST /reservas/:id/confirmar, /rechazar, /cancelar, /prestamo |
| Auditoría | GET /auditoria, /auditoria/:id |

Listados: `pagina`, `limite` (máximo 100); respuesta `{datos,total,pagina,limite}`.
Catálogo: `q`, `tipo`, `disponible`; unidades admiten `inicio` y `fin` juntos como
ISO con zona. Con intervalo, `disponible` indica ausencia de conflictos en ese periodo;
`disponible=true` filtra libres, `false` ocupadas y sin filtro se muestran ambas.
Reservas: filtro `estado`. Los solicitantes solo acceden a `/reservas/mias`.

Solicitud:
```json
{"unidad_id":"1","inicio":"2027-01-10T10:00:00-05:00","fin":"2027-01-10T11:00:00-05:00","uso_previsto":"Lectura académica"}
```

Confirmar: `{}`. Rechazar/cancelar: `{"motivo":"Descripción"}`.
Convertir: campos de entrega sin solicitante/unidad: `vencimiento`, `modalidad`,
`condicion_entrega`, `accesorios_entrega`, `confirmar:true`. Se toman titular y
unidad de la reserva bloqueada; no se pueden sustituir desde el navegador.

El frontend contiene los formularios de los contratos completos y las rutas
validan los cuerpos con Zod. Revisar `backend/src/modules/*/*.schemas.js`.
