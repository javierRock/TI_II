exports.up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION prestamos.proteger_identidad_cuenta() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF NEW.persona_id <> OLD.persona_id THEN
            RAISE EXCEPTION 'Una cuenta no se puede reasignar a otra persona' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END;
    $$;
    CREATE TRIGGER usuario_identidad_inmutable BEFORE UPDATE OF persona_id ON prestamos.usuarios
        FOR EACH ROW EXECUTE FUNCTION prestamos.proteger_identidad_cuenta();

    CREATE OR REPLACE FUNCTION prestamos.revocar_sesiones() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        IF (OLD.activo AND NOT NEW.activo) OR OLD.rol <> NEW.rol
            OR OLD.atribucion_admin <> NEW.atribucion_admin OR OLD.password_hash <> NEW.password_hash THEN
            UPDATE prestamos.sesiones SET revocada_en = clock_timestamp() WHERE usuario_id = NEW.id AND revocada_en IS NULL;
        END IF;
        RETURN NULL;
    END;
    $$;
  `);
};

exports.down = () => {
  throw new Error('No retirar protecciones de identidad/sesiones; aplicar una migración correctiva.');
};
