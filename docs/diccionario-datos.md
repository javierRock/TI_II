# Diccionario de datos

Esquema: **DBsistema_prestamos**, MySQL 8.4, InnoDB. El SQL exacto de columnas,
índices y restricciones está en `backend/database/migrations/001_tablas.sql` y
las migraciones posteriores. Esta guía agrupa columnas del mismo dominio.

Convenciones: `id` es BIGINT autoincremental y PK; los identificadores se envían
como cadenas en JSON. BOOLEAN es TINYINT(1). DATETIME(6) usa UTC; DATE no tiene
hora. `creado_en` es la fecha de alta automática, salvo el nombre `creada_en`
en reservas. Una columna opcional admite NULL; el resto es obligatorio, generado
o tiene valor predeterminado.

## Personas y cuentas

| Tabla | Columnas / tipo | Significado y límites |
| --- | --- | --- |
| personas | id BIGINT | Identidad interna |
| personas | documento VARCHAR(32) | Documento único, no vacío |
| personas | nombre_completo VARCHAR(200), correo VARCHAR(254) | Identidad y contacto; los nombres pueden repetirse |
| personas | contacto VARCHAR(100), activo BOOLEAN, creado_en DATETIME(6) | Contacto opcional y baja lógica |
| usuarios | id, persona_id BIGINT | Cuenta y FK única a personas |
| usuarios | nombre_usuario VARCHAR(64), password_hash VARCHAR(255) | Login único; hash Argon2id, nunca contraseña en texto plano |
| usuarios | rol ENUM | personal_administrativo, docente o estudiante |
| usuarios | activo, atribucion_admin BOOLEAN | Acceso y permiso administrativo separados; estudiante no puede ser admin |
| usuarios | atribucion_otorgada_por BIGINT, atribucion_otorgada_en DATETIME(6) | Responsable FK a usuarios y fecha; obligatorios si existe atribución |
| usuarios | ultimo_acceso_en, creado_en DATETIME(6) | Último login opcional y alta |
| planes_estudio | id BIGINT, codigo VARCHAR(50) | Plan y código único |
| planes_estudio | programa, nombre VARCHAR(150), activo BOOLEAN, creado_en DATETIME(6) | Descripción y habilitación |
| semestres_plan | id, plan_id BIGINT; numero SMALLINT | FK a plan; número positivo y único dentro de ese plan |
| perfiles_academicos | id, usuario_id BIGINT; tipo ENUM | FK a cuenta; un perfil de cada tipo estudiante/docente por cuenta |
| perfiles_academicos | codigo VARCHAR(50), habilitado BOOLEAN | Código único por tipo; habilitación académica |
| perfiles_academicos | plan_id BIGINT, semestre SMALLINT | Para estudiante; FK compuesta al semestre del plan |
| perfiles_academicos | especialidad, vinculacion VARCHAR(150) | Para docente; opcionales en estudiante |
| perfiles_academicos | creado_en DATETIME(6) | Alta del perfil |
| sesiones | id, usuario_id BIGINT; token_hash CHAR(64) | FK a cuenta y hash único; no se almacena el token original |
| sesiones | creado_en, expira_en, revocada_en DATETIME(6) | Expiración posterior al alta; revocación opcional |

## Catálogo

| Tabla | Columnas / tipo | Significado y límites |
| --- | --- | --- |
| tipos_bien | id BIGINT, codigo ENUM | libro, mesa_ping_pong, visor_3d, parlante o carrito_robotica; código único |
| tipos_bien | nombre VARCHAR(100), descripcion TEXT, habilitado BOOLEAN | Nombre único; descripción opcional |
| bienes | id, tipo_id BIGINT; nombre VARCHAR(200) | Ficha y FK a tipo |
| bienes | descripcion TEXT, autor VARCHAR(200), edicion VARCHAR(100), isbn VARCHAR(32) | Datos opcionales; bibliografía solo para libros, ISBN no único |
| bienes | marca, modelo VARCHAR(100), creado_en DATETIME(6) | Datos opcionales solo para bienes no bibliográficos |
| unidades_inventario | id, bien_id BIGINT; codigo_inventario VARCHAR(64) | Ejemplar físico, FK a ficha y código único |
| unidades_inventario | custodia VARCHAR(30), adscrito_laboratorio BOOLEAN | Solo escuela y no adscrito a laboratorio |
| unidades_inventario | ubicacion VARCHAR(200), condicion_fisica TEXT, accesorios JSON | Ubicación, inspección y lista de accesorios |
| unidades_inventario | estado ENUM | disponible, prestada, mantenimiento o baja; el servicio sincroniza prestada con préstamos abiertos |
| unidades_inventario | serie, marca, modelo VARCHAR(100) | Opcionales; una serie exige marca/modelo y el conjunto es único |
| unidades_inventario | adquirido_en DATE, baja_en DATETIME(6), motivo_baja TEXT | Adquisición opcional; fecha/motivo obligatorios únicamente para baja |
| unidades_inventario | observaciones TEXT, creado_en DATETIME(6) | Observaciones opcionales y alta |

El motivo de mantenimiento se conserva en auditoría y en cancelaciones afectadas,
no se reutiliza `motivo_baja` para una unidad que no está dada de baja.

## Políticas y reservas

| Tabla | Columnas / tipo | Significado y límites |
| --- | --- | --- |
| alcances_politica | nombre VARCHAR(30) PK | general, estudiante o docente; fila estable para bloqueos |
| politicas_prestamo | id BIGINT, rol ENUM opcional, alcance VARCHAR(30) generado | NULL significa general; alcance deriva del rol |
| politicas_prestamo | version INT, nombre VARCHAR(150) | Versión única por alcance y descripción |
| politicas_prestamo | vigencia_inicio, vigencia_fin DATETIME(6) | Vigencia semiabierta; fin opcional, posterior al inicio |
| politicas_prestamo | aprobada_en DATETIME(6), aprobada_por BIGINT | Ambos nulos en borrador o ambos presentes; FK a aprobador |
| politicas_prestamo | cupo_total SMALLINT, duracion_cantidad INT, duracion_unidad ENUM | Cupo positivo y duración en horas/dias |
| politicas_prestamo | modalidades JSON | Lista no vacía de modalidades admitidas |
| politicas_prestamo | garantia_exigida, renovacion_permitida BOOLEAN; max_renovaciones INT; tarifa_diaria DECIMAL(12,2) | Reservados; forzosamente false/0 en esta entrega |
| politicas_prestamo | tolerancia_horas INT, creado_en DATETIME(6) | Tolerancia no negativa; no libera bienes vencidos |
| reservas | id, solicitante_id, unidad_id BIGINT | Reserva, cuenta titular y ejemplar, con FK |
| reservas | inicio, fin DATETIME(6); uso_previsto TEXT | Intervalo [inicio, fin), fin posterior al inicio, propósito |
| reservas | estado ENUM, creada_en DATETIME(6) | pendiente, confirmada, rechazada, cancelada, atendida o vencida |
| reservas | decidida_por BIGINT, decidida_en DATETIME(6), motivo_decision TEXT | Responsable FK y decisión; confirmación documentada y rechazo con motivo |
| reservas | cancelada_por BIGINT, cancelada_en DATETIME(6), motivo_cancelacion TEXT | Datos obligatorios al cancelar; conservados para trazabilidad |

## Préstamos y auditoría

| Tabla | Columnas / tipo | Significado y límites |
| --- | --- | --- |
| prestamos | id, solicitante_id, autorizado_por, unidad_id BIGINT | Titular, autorizante y unidad con FK |
| prestamos | reserva_id BIGINT opcional y único | FK compuesta: reserva del mismo titular y unidad; NULL en entrega directa |
| prestamos | inicio, vencimiento DATETIME(6); estado_cierre ENUM | Entrega, plazo y abierto/devuelto; estado activo/vencido es derivado |
| prestamos | unidad_abierta BIGINT generado y único | Unidad si está abierto; NULL al cerrar, impide dos abiertos por unidad |
| prestamos | modalidad ENUM, condicion_entrega TEXT, accesorios_entrega JSON, observaciones_entrega TEXT | en_sitio/retiro; inspección inmutable; observaciones opcionales |
| prestamos | politica_condiciones_id, politica_cupo_id BIGINT | FK a políticas aplicadas, conservadas históricamente |
| prestamos | rol_origen VARCHAR(20), cupo_aplicado SMALLINT, duracion_max_horas INT | Copia histórica de condiciones; vencimiento no excede duración |
| prestamos | garantia_exigida, renovacion_permitida BOOLEAN; max_renovaciones, tolerancia_horas INT; tarifa_diaria DECIMAL(12,2) | Condiciones históricas; funciones fuera de alcance permanecen deshabilitadas |
| prestamos | devolucion_en DATETIME(6), recibido_por BIGINT | Fecha y FK al administrador receptor al cerrar |
| prestamos | condicion_devolucion TEXT, accesorios_devolucion JSON, observaciones_devolucion TEXT | Inspección de recepción; nulos antes de devolver |
| prestamos | devolucion_apta BOOLEAN, destino_devolucion VARCHAR(20), creado_en DATETIME(6) | Aptitud y destino; una no apta no puede ir a disponible |
| eventos_historial | id, actor_usuario_id BIGINT; actor_proceso VARCHAR(150) | Actor humano FK o proceso técnico, exactamente uno presente |
| eventos_historial | entidad VARCHAR(80), entidad_id VARCHAR(100), accion VARCHAR(100) | Registro afectado y operación |
| eventos_historial | resultado ENUM, detalle JSON, creado_en DATETIME(6) | exito/rechazado/error y detalle; triggers impiden editar/borrar |
| schema_migrations | nombre VARCHAR(200) PK, checksum CHAR(64), completada BOOLEAN | Nombre SQL, SHA-256 y finalización; una parcial detiene el ejecutor |

Vistas: `v_prestamos_estado` añade estado, retraso y exceso de tolerancia;
`v_disponibilidad_actual` no muestra titulares. El endpoint del catálogo añade
conflictos con reservas actuales o del intervalo consultado.
