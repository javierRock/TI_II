-- Auditoría transaccional: los eventos se confirman o revierten con el negocio.

DELIMITER $$

CREATE PROCEDURE auditar(
    IN tabla VARCHAR(80),
    IN registro BIGINT,
    IN accion VARCHAR(100),
    IN detalle JSON
)
BEGIN
    INSERT INTO eventos_historial (
        actor_usuario_id, actor_proceso, entidad, entidad_id, accion, detalle
    )
    VALUES (
        @actor_usuario_id,
        IF(
            @actor_usuario_id IS NULL,
            COALESCE(@actor_proceso, CONCAT('sql:', USER())),
            NULL
        ),
        tabla,
        CAST(registro AS CHAR),
        accion,
        detalle
    );
END$$

-- Personas y cuentas: nunca registrar contraseñas ni tokens.
CREATE TRIGGER personas_alta
AFTER INSERT ON personas
FOR EACH ROW
BEGIN
    CALL auditar('personas', NEW.id, 'insert', JSON_OBJECT('nombre', NEW.nombre_completo));
END$$

CREATE TRIGGER personas_cambio
AFTER UPDATE ON personas
FOR EACH ROW
BEGIN
    CALL auditar('personas', NEW.id, 'update', JSON_OBJECT(
        'anterior', OLD.nombre_completo,
        'nuevo', NEW.nombre_completo,
        'activo', NEW.activo
    ));
END$$

CREATE TRIGGER usuarios_alta
AFTER INSERT ON usuarios
FOR EACH ROW
BEGIN
    CALL auditar('usuarios', NEW.id, 'insert', JSON_OBJECT(
        'usuario', NEW.nombre_usuario, 'rol', NEW.rol
    ));
END$$

CREATE TRIGGER usuarios_auditoria
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
    CALL auditar('usuarios', NEW.id, 'update', JSON_OBJECT(
        'rol_anterior', OLD.rol,
        'rol', NEW.rol,
        'activo', NEW.activo,
        'atribucion_admin', NEW.atribucion_admin
    ));
END$$

-- Perfiles y soporte académico.
CREATE TRIGGER perfiles_alta
AFTER INSERT ON perfiles_academicos
FOR EACH ROW
BEGIN
    CALL auditar('perfiles_academicos', NEW.id, 'insert', JSON_OBJECT(
        'tipo', NEW.tipo, 'habilitado', NEW.habilitado
    ));
END$$

CREATE TRIGGER perfiles_cambio
AFTER UPDATE ON perfiles_academicos
FOR EACH ROW
BEGIN
    CALL auditar('perfiles_academicos', NEW.id, 'update', JSON_OBJECT('habilitado', NEW.habilitado));
END$$

CREATE TRIGGER planes_alta
AFTER INSERT ON planes_estudio
FOR EACH ROW
BEGIN
    CALL auditar('planes_estudio', NEW.id, 'insert', JSON_OBJECT('codigo', NEW.codigo));
END$$

CREATE TRIGGER planes_cambio
AFTER UPDATE ON planes_estudio
FOR EACH ROW
BEGIN
    CALL auditar('planes_estudio', NEW.id, 'update', JSON_OBJECT(
        'nombre', NEW.nombre, 'activo', NEW.activo
    ));
END$$

CREATE TRIGGER semestres_alta
AFTER INSERT ON semestres_plan
FOR EACH ROW
BEGIN
    CALL auditar('semestres_plan', NEW.id, 'insert', JSON_OBJECT(
        'plan', NEW.plan_id, 'numero', NEW.numero
    ));
END$$

-- Fichas y ejemplares.
CREATE TRIGGER bienes_alta
AFTER INSERT ON bienes
FOR EACH ROW
BEGIN
    CALL auditar('bienes', NEW.id, 'insert', JSON_OBJECT('nombre', NEW.nombre, 'isbn', NEW.isbn));
END$$

CREATE TRIGGER bienes_cambio
AFTER UPDATE ON bienes
FOR EACH ROW
BEGIN
    CALL auditar('bienes', NEW.id, 'update', JSON_OBJECT(
        'anterior', OLD.nombre, 'nombre', NEW.nombre, 'isbn', NEW.isbn
    ));
END$$

CREATE TRIGGER unidades_alta
AFTER INSERT ON unidades_inventario
FOR EACH ROW
BEGIN
    CALL auditar('unidades_inventario', NEW.id, 'insert', JSON_OBJECT(
        'codigo', NEW.codigo_inventario, 'estado', NEW.estado
    ));
END$$

CREATE TRIGGER unidades_cambio
AFTER UPDATE ON unidades_inventario
FOR EACH ROW
BEGIN
    CALL auditar('unidades_inventario', NEW.id, 'update', JSON_OBJECT(
        'estado_anterior', OLD.estado,
        'estado', NEW.estado,
        'condicion', NEW.condicion_fisica,
        'accesorios', NEW.accesorios
    ));
END$$

-- Políticas, reservas y préstamos.
CREATE TRIGGER politicas_alta
AFTER INSERT ON politicas_prestamo
FOR EACH ROW
BEGIN
    CALL auditar('politicas_prestamo', NEW.id, 'insert', JSON_OBJECT(
        'nombre', NEW.nombre, 'version', NEW.version
    ));
END$$

CREATE TRIGGER politicas_cambio
AFTER UPDATE ON politicas_prestamo
FOR EACH ROW
BEGIN
    CALL auditar('politicas_prestamo', NEW.id, 'update', JSON_OBJECT(
        'aprobada_por', NEW.aprobada_por, 'fin', NEW.vigencia_fin
    ));
END$$

CREATE TRIGGER reservas_alta
AFTER INSERT ON reservas
FOR EACH ROW
BEGIN
    CALL auditar('reservas', NEW.id, 'insert', JSON_OBJECT(
        'solicitante', NEW.solicitante_id,
        'unidad', NEW.unidad_id,
        'inicio', NEW.inicio,
        'fin', NEW.fin
    ));
END$$

CREATE TRIGGER reservas_cambio
AFTER UPDATE ON reservas
FOR EACH ROW
BEGIN
    CALL auditar('reservas', NEW.id, 'update', JSON_OBJECT(
        'anterior', OLD.estado,
        'estado', NEW.estado,
        'motivo', COALESCE(NEW.motivo_cancelacion, NEW.motivo_decision)
    ));
END$$

CREATE TRIGGER prestamos_alta
AFTER INSERT ON prestamos
FOR EACH ROW
BEGIN
    CALL auditar('prestamos', NEW.id, 'insert', JSON_OBJECT(
        'solicitante', NEW.solicitante_id,
        'unidad', NEW.unidad_id,
        'reserva', NEW.reserva_id,
        'vencimiento', NEW.vencimiento
    ));
END$$

CREATE TRIGGER prestamos_cambio
AFTER UPDATE ON prestamos
FOR EACH ROW
BEGIN
    CALL auditar('prestamos', NEW.id, 'update', JSON_OBJECT(
        'estado', NEW.estado_cierre,
        'devolucion', NEW.devolucion_en,
        'apta', NEW.devolucion_apta,
        'destino', NEW.destino_devolucion
    ));
END$$

DELIMITER ;
