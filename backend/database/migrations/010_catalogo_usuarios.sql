-- Documentar la atribución administrativa y la aprobación de políticas.
ALTER TABLE usuarios
    ADD CONSTRAINT atribucion_documentada
    CHECK (
        NOT atribucion_admin
        OR (atribucion_otorgada_en IS NOT NULL AND atribucion_otorgada_por IS NOT NULL)
    );

ALTER TABLE politicas_prestamo
    ADD CONSTRAINT aprobacion_completa
    CHECK ((aprobada_en IS NULL) = (aprobada_por IS NULL));

DELIMITER $$

-- Una ficha bibliográfica y un equipo no comparten las mismas características.
CREATE PROCEDURE validar_ficha(
    IN tipo BIGINT,
    IN autor TEXT,
    IN edicion TEXT,
    IN isbn TEXT,
    IN marca TEXT,
    IN modelo TEXT
)
BEGIN
    IF EXISTS (
        SELECT 1
        FROM tipos_bien
        WHERE id = tipo AND codigo = 'libro'
    ) THEN
        IF marca IS NOT NULL OR modelo IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Los libros no tienen marca o modelo';
        END IF;
    ELSE
        IF autor IS NOT NULL OR edicion IS NOT NULL OR isbn IS NOT NULL THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'Solo los libros tienen datos bibliográficos';
        END IF;
    END IF;
END$$

CREATE TRIGGER ficha_insertar
BEFORE INSERT ON bienes
FOR EACH ROW
BEGIN
    CALL validar_ficha(NEW.tipo_id, NEW.autor, NEW.edicion, NEW.isbn, NEW.marca, NEW.modelo);
END$$

CREATE TRIGGER ficha_actualizar
BEFORE UPDATE ON bienes
FOR EACH ROW
BEGIN
    CALL validar_ficha(NEW.tipo_id, NEW.autor, NEW.edicion, NEW.isbn, NEW.marca, NEW.modelo);
END$$

CREATE TRIGGER cuenta_activar
BEFORE UPDATE ON usuarios
FOR EACH ROW
BEGIN
    IF NEW.persona_id <> OLD.persona_id
        OR (
            NEW.activo
            AND NOT EXISTS (
                SELECT 1
                FROM personas
                WHERE id = NEW.persona_id AND activo
            )
        ) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'No reasignar cuentas ni activar una cuenta de persona inactiva';
    END IF;
END$$

DELIMITER ;
