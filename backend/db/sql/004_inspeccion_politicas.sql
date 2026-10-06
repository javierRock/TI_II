-- No inferir retrospectivamente la aptitud de devoluciones históricas.
ALTER TABLE prestamos.prestamos ADD COLUMN devolucion_apta boolean;
ALTER TABLE prestamos.prestamos ADD COLUMN destino_devolucion varchar(20);
ALTER TABLE prestamos.prestamos ADD CONSTRAINT prestamo_inspeccion_coherente CHECK (
    (devolucion_apta IS NULL AND destino_devolucion IS NULL)
    OR (estado_cierre = 'devuelto' AND devolucion_apta IS NOT NULL
        AND destino_devolucion IS NOT NULL AND destino_devolucion IN ('disponible', 'mantenimiento', 'baja')
        AND (devolucion_apta OR destino_devolucion <> 'disponible'))
);

CREATE FUNCTION prestamos.accesorios_completos(esperados jsonb, recibidos jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM (
            SELECT lower(btrim(value)) AS accesorio, count(*) AS cantidad
            FROM jsonb_array_elements_text(esperados) GROUP BY lower(btrim(value))
        ) e LEFT JOIN (
            SELECT lower(btrim(value)) AS accesorio, count(*) AS cantidad
            FROM jsonb_array_elements_text(recibidos) GROUP BY lower(btrim(value))
        ) r USING (accesorio) WHERE e.cantidad > COALESCE(r.cantidad, 0)
    );
$$;

-- Aprobar exige un administrador activo en ese instante. Retirar la vigencia de
-- una versión no invalida su aprobación si su aprobador luego se desactiva.
CREATE OR REPLACE FUNCTION prestamos.validar_politica() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.aprobada_en IS NOT NULL THEN
        IF (to_jsonb(NEW) - 'vigencia_fin') IS DISTINCT FROM (to_jsonb(OLD) - 'vigencia_fin') THEN
            RAISE EXCEPTION 'Crear una nueva versión: las condiciones aprobadas son inmutables' USING ERRCODE = '23514';
        END IF;
        IF NEW.vigencia_fin IS DISTINCT FROM OLD.vigencia_fin AND (
            NEW.vigencia_fin IS NULL OR NEW.vigencia_fin < clock_timestamp()
            OR (OLD.vigencia_fin IS NOT NULL AND NEW.vigencia_fin > OLD.vigencia_fin)
        ) THEN
            RAISE EXCEPTION 'Solo se puede acortar la vigencia a una fecha futura' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.aprobada_en IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.aprobada_en IS NULL) THEN
        IF NEW.aprobada_en > clock_timestamp() OR NOT EXISTS (
            SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
            WHERE u.id = NEW.aprobada_por AND u.activo AND p.activo AND u.atribucion_admin
        ) THEN
            RAISE EXCEPTION 'La aprobación requiere fecha real y administrador habilitado' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prestamos.validar_prestamo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    solicitante prestamos.usuarios%ROWTYPE;
    unidad prestamos.unidades_inventario%ROWTYPE;
    politica prestamos.politicas_prestamo%ROWTYPE;
    abiertos integer;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.estado_cierre <> 'abierto' THEN
            RAISE EXCEPTION 'Un préstamo cerrado no se modifica' USING ERRCODE = '23514';
        END IF;
        IF (to_jsonb(NEW) - ARRAY['estado_cierre', 'devolucion_en', 'recibido_por', 'condicion_devolucion', 'accesorios_devolucion', 'observaciones_devolucion', 'devolucion_apta', 'destino_devolucion'])
            IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado_cierre', 'devolucion_en', 'recibido_por', 'condicion_devolucion', 'accesorios_devolucion', 'observaciones_devolucion', 'devolucion_apta', 'destino_devolucion']) THEN
            RAISE EXCEPTION 'La entrega y sus condiciones históricas son inmutables' USING ERRCODE = '23514';
        END IF;
        IF NEW.estado_cierre = 'devuelto' THEN
            IF NOT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
                WHERE u.id = NEW.recibido_por AND u.activo AND p.activo AND u.atribucion_admin) THEN
                RAISE EXCEPTION 'La devolución requiere un administrador habilitado' USING ERRCODE = '23514';
            END IF;
            IF NEW.devolucion_apta IS NULL OR NEW.destino_devolucion IS NULL THEN
                RAISE EXCEPTION 'La devolución requiere inspección de aptitud y destino' USING ERRCODE = '23514';
            END IF;
            IF NEW.devolucion_apta AND NOT prestamos.accesorios_completos(OLD.accesorios_entrega, NEW.accesorios_devolucion) THEN
                RAISE EXCEPTION 'Una devolución con accesorios faltantes no puede declararse apta' USING ERRCODE = '23514';
            END IF;
        END IF;
        IF NEW.devolucion_en > clock_timestamp() THEN
            RAISE EXCEPTION 'La devolución real no puede estar en el futuro' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    PERFORM id FROM prestamos.usuarios WHERE id IN (NEW.solicitante_id, NEW.autorizado_por) ORDER BY id FOR UPDATE;
    SELECT * INTO solicitante FROM prestamos.usuarios WHERE id = NEW.solicitante_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Solicitante inexistente' USING ERRCODE = '23503'; END IF;
    IF NOT solicitante.activo OR solicitante.rol NOT IN ('estudiante', 'docente') OR NOT EXISTS (
        SELECT 1 FROM prestamos.personas WHERE id = solicitante.persona_id AND activo
    ) THEN
        RAISE EXCEPTION 'Solicitante no habilitado' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prestamos.perfiles_academicos pa
        LEFT JOIN prestamos.planes_estudio pe ON pe.id = pa.plan_id
        WHERE pa.usuario_id = solicitante.id AND pa.tipo = solicitante.rol AND pa.habilitado
            AND (pa.tipo = 'docente' OR pe.activo)) THEN
        RAISE EXCEPTION 'El solicitante requiere un perfil académico habilitado' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
        WHERE u.id = NEW.autorizado_por AND u.activo AND p.activo AND u.atribucion_admin) THEN
        RAISE EXCEPTION 'La entrega requiere un administrador habilitado' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado_cierre <> 'abierto' OR NEW.inicio > clock_timestamp() THEN
        RAISE EXCEPTION 'La entrega debe crear un préstamo abierto con inicio real' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO unidad FROM prestamos.unidades_inventario WHERE id = NEW.unidad_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unidad inexistente' USING ERRCODE = '23503'; END IF;
    IF unidad.estado <> 'disponible' OR NOT EXISTS (SELECT 1 FROM prestamos.bienes b
        JOIN prestamos.tipos_bien t ON t.id = b.tipo_id WHERE b.id = unidad.bien_id AND t.habilitado) THEN
        RAISE EXCEPTION 'La unidad no está disponible o su tipo no está habilitado' USING ERRCODE = '23514';
    END IF;
    IF NOT prestamos.accesorios_completos(unidad.accesorios, NEW.accesorios_entrega)
        OR NOT prestamos.accesorios_completos(NEW.accesorios_entrega, unidad.accesorios) THEN
        RAISE EXCEPTION 'La entrega debe verificar los accesorios registrados de la unidad' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO politica FROM prestamos.politicas_prestamo
        WHERE aprobada_en IS NOT NULL AND aprobada_en <= NEW.inicio
            AND (rol = solicitante.rol OR rol IS NULL)
            AND tstzrange(vigencia_inicio, vigencia_fin, '[)') @> NEW.inicio
        ORDER BY rol NULLS LAST LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe una política aprobada aplicable' USING ERRCODE = '23514'; END IF;
    IF NOT (NEW.modalidad = ANY(politica.modalidades)) THEN
        RAISE EXCEPTION 'Modalidad no permitida por la política' USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO abiertos FROM prestamos.prestamos WHERE solicitante_id = NEW.solicitante_id AND estado_cierre = 'abierto';
    IF abiertos >= politica.cupo_total THEN RAISE EXCEPTION 'El solicitante alcanzó su cupo total' USING ERRCODE = '23514'; END IF;
    NEW.politica_condiciones_id := politica.id;
    NEW.politica_cupo_id := politica.id;
    NEW.rol_origen := solicitante.rol;
    NEW.cupo_aplicado := politica.cupo_total;
    NEW.duracion_max_horas := politica.duracion_cantidad * CASE politica.duracion_unidad WHEN 'dias' THEN 24 ELSE 1 END;
    NEW.garantia_exigida := politica.garantia_exigida;
    NEW.renovacion_permitida := politica.renovacion_permitida;
    NEW.max_renovaciones := politica.max_renovaciones;
    NEW.tolerancia_horas := politica.tolerancia_horas;
    NEW.tarifa_diaria := politica.tarifa_diaria;
    RETURN NEW;
END;
$$;

CREATE FUNCTION prestamos.comprobar_inspeccion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE estado_actual text;
BEGIN
    SELECT estado INTO estado_actual FROM prestamos.unidades_inventario WHERE id = NEW.unidad_id;
    IF estado_actual IS DISTINCT FROM NEW.destino_devolucion THEN
        RAISE EXCEPTION 'La unidad debe quedar en el destino registrado en su inspección' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER devolucion_destino_consistente AFTER UPDATE ON prestamos.prestamos
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
    WHEN (OLD.estado_cierre = 'abierto' AND NEW.estado_cierre = 'devuelto')
    EXECUTE FUNCTION prestamos.comprobar_inspeccion();

-- Mantener el orden de las columnas anteriores de la vista y añadir las nuevas
-- al final, sin eliminar la vista ni sus dependencias.
DO $$
DECLARE columnas text;
BEGIN
    SELECT string_agg('p.' || quote_ident(attname), ', ' ORDER BY attnum) INTO columnas
    FROM pg_attribute WHERE attrelid = 'prestamos.prestamos'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname NOT IN ('devolucion_apta', 'destino_devolucion');
    EXECUTE format('CREATE OR REPLACE VIEW prestamos.v_prestamos_estado WITH (security_invoker = true) AS
        SELECT %s, CASE WHEN p.estado_cierre = ''devuelto'' THEN ''devuelto''
            WHEN p.vencimiento <= CURRENT_TIMESTAMP THEN ''vencido'' ELSE ''activo'' END AS estado,
        p.devolucion_apta, p.destino_devolucion,
        GREATEST(0, extract(epoch FROM (COALESCE(p.devolucion_en, CURRENT_TIMESTAMP) - p.vencimiento)))::numeric(20,6) AS retraso_segundos,
        GREATEST(0, extract(epoch FROM (COALESCE(p.devolucion_en, CURRENT_TIMESTAMP) - p.vencimiento)) - p.tolerancia_horas * 3600::numeric)::numeric(20,6) AS exceso_tolerancia_segundos
        FROM prestamos.prestamos p', columnas);
END;
$$;
COMMENT ON COLUMN prestamos.prestamos.devolucion_apta IS 'Inspección explícita; NULL conserva ausencia de ese dato en devoluciones históricas previas.';
COMMENT ON COLUMN prestamos.prestamos.destino_devolucion IS 'Destino al recibir, conservado aunque después la unidad salga de mantenimiento.';
