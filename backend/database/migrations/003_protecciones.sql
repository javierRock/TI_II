-- Protecciones de auditoría, accesos y condiciones históricas.
-- El ejecutor reconoce DELIMITER igual que los clientes gráficos MySQL.

DELIMITER $$

CREATE TRIGGER historial_no_editar
BEFORE UPDATE ON eventos_historial
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La auditoría es de solo adición';
END$$

CREATE TRIGGER historial_no_borrar
BEFORE DELETE ON eventos_historial
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'La auditoría es de solo adición';
END$$

-- Revocar sesiones si cambian las credenciales o los permisos de la cuenta.
CREATE TRIGGER usuario_cambios
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
    IF (OLD.activo AND NOT NEW.activo)
        OR OLD.rol <> NEW.rol
        OR OLD.atribucion_admin <> NEW.atribucion_admin
        OR OLD.password_hash <> NEW.password_hash THEN
        UPDATE sesiones
        SET revocada_en = UTC_TIMESTAMP(6)
        WHERE usuario_id = NEW.id AND revocada_en IS NULL;
    END IF;
END$$

CREATE TRIGGER persona_desactivar
AFTER UPDATE ON personas
FOR EACH ROW
BEGIN
    IF OLD.activo AND NOT NEW.activo THEN
        UPDATE usuarios
        SET activo = FALSE
        WHERE persona_id = NEW.id;
    END IF;
END$$

-- Las condiciones aprobadas no se sobrescriben: se crea otra versión.
CREATE TRIGGER politica_inmutable
BEFORE UPDATE ON politicas_prestamo
FOR EACH ROW
BEGIN
    IF OLD.aprobada_en IS NOT NULL AND (
        NOT (NEW.rol <=> OLD.rol)
        OR NEW.version <> OLD.version
        OR NEW.nombre <> OLD.nombre
        OR NEW.cupo_total <> OLD.cupo_total
        OR NEW.duracion_cantidad <> OLD.duracion_cantidad
        OR NEW.duracion_unidad <> OLD.duracion_unidad
        OR NOT (NEW.modalidades <=> OLD.modalidades)
        OR NEW.vigencia_inicio <> OLD.vigencia_inicio
        OR NOT (NEW.aprobada_en <=> OLD.aprobada_en)
        OR NEW.tolerancia_horas <> OLD.tolerancia_horas
        OR NOT (NEW.aprobada_por <=> OLD.aprobada_por)
        OR (
            NOT (NEW.vigencia_fin <=> OLD.vigencia_fin)
            AND (
                NEW.vigencia_fin IS NULL
                OR NEW.vigencia_fin <= UTC_TIMESTAMP(6)
                OR (
                    OLD.vigencia_fin IS NOT NULL
                    AND NEW.vigencia_fin > OLD.vigencia_fin
                )
            )
        )
    ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'La política aprobada es inmutable; crear otra versión';
    END IF;
END$$

-- Protección inicial, ampliada en 007_entrega_inmutable.sql.
CREATE TRIGGER prestamo_cerrado
BEFORE UPDATE ON prestamos
FOR EACH ROW
BEGIN
    IF OLD.estado_cierre = 'devuelto'
        OR NEW.solicitante_id <> OLD.solicitante_id
        OR NEW.unidad_id <> OLD.unidad_id
        OR NEW.inicio <> OLD.inicio
        OR NEW.vencimiento <> OLD.vencimiento
        OR NOT (NEW.reserva_id <=> OLD.reserva_id)
        OR NEW.autorizado_por <> OLD.autorizado_por
        OR NEW.politica_condiciones_id <> OLD.politica_condiciones_id THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No modificar entrega ni préstamo cerrado';
    END IF;
END$$

DELIMITER ;
