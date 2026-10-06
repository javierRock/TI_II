exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION prestamos.validar_cuenta() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE persona_activa boolean;
    BEGIN
        IF NEW.activo THEN
            -- Serializar el alta/reactivación con la desactivación de la persona.
            SELECT activo INTO persona_activa FROM prestamos.personas WHERE id = NEW.persona_id FOR SHARE;
            IF NOT FOUND THEN RAISE EXCEPTION 'Persona inexistente' USING ERRCODE = '23503'; END IF;
            IF NOT persona_activa THEN
                RAISE EXCEPTION 'Una cuenta activa requiere una persona activa' USING ERRCODE = '23514';
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$;

    CREATE OR REPLACE FUNCTION prestamos.validar_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
        -- Si se desactiva la cuenta concurrentemente, o no se crea la sesión,
        -- o la desactivación posterior también revoca la nueva sesión.
        PERFORM id FROM prestamos.usuarios WHERE id = NEW.usuario_id FOR UPDATE;
        IF NOT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
            WHERE u.id = NEW.usuario_id AND u.activo AND p.activo) THEN
            RAISE EXCEPTION 'No se puede crear una sesión para una cuenta inactiva' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END;
    $$;
  `);
};

exports.down = () => {
  throw new Error('No retirar protecciones de concurrencia; aplicar una migración correctiva.');
};
