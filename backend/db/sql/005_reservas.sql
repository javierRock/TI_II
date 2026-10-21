-- Incremento aditivo: las entregas y sus políticas históricas se conservan.
CREATE TABLE prestamos.reservas (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    solicitante_id bigint NOT NULL REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    unidad_id bigint NOT NULL REFERENCES prestamos.unidades_inventario(id) ON DELETE RESTRICT,
    inicio timestamptz NOT NULL,
    fin timestamptz NOT NULL CHECK (fin > inicio),
    modalidad varchar(20) NOT NULL CHECK (modalidad IN ('en_sitio', 'retiro')),
    estado varchar(20) NOT NULL DEFAULT 'solicitada'
        CHECK (estado IN ('solicitada', 'confirmada', 'rechazada', 'cancelada', 'atendida')),
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
    decidido_en timestamptz,
    decidido_por bigint REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    motivo text,
    CONSTRAINT reserva_decision_completa CHECK (
        (estado = 'solicitada' AND decidido_en IS NULL AND decidido_por IS NULL AND motivo IS NULL)
        OR (estado <> 'solicitada' AND decidido_en IS NOT NULL AND decidido_por IS NOT NULL
            AND (estado NOT IN ('rechazada', 'cancelada') OR (motivo IS NOT NULL AND length(btrim(motivo)) > 0)))),
    CONSTRAINT reserva_unidad_intervalo EXCLUDE USING gist
        (unidad_id WITH =, tstzrange(inicio, fin, '[)') WITH &&) WHERE (estado = 'confirmada')
);
CREATE INDEX reservas_solicitante_idx ON prestamos.reservas (solicitante_id, inicio DESC);
CREATE INDEX reservas_estado_inicio_idx ON prestamos.reservas (estado, inicio);
ALTER TABLE prestamos.prestamos ADD COLUMN reserva_id bigint UNIQUE
    REFERENCES prestamos.reservas(id) ON DELETE RESTRICT;

-- El cupo se comprueba en los puntos donde puede aumentar la ocupación.
-- Los préstamos abiertos cuentan hasta su devolución real, incluso vencidos.
CREATE FUNCTION prestamos.cupo_reserva_excedido(usuario bigint, desde timestamptz,
    hasta timestamptz, cupo integer, excluir bigint DEFAULT NULL)
RETURNS boolean LANGUAGE sql VOLATILE AS $$
    SELECT EXISTS (
        SELECT 1 FROM (
            SELECT desde AS instante
            UNION SELECT r.inicio FROM prestamos.reservas r
                WHERE r.solicitante_id = usuario AND r.estado = 'confirmada'
                    AND r.id IS DISTINCT FROM excluir AND r.inicio >= desde AND r.inicio < hasta
        ) puntos WHERE
        (SELECT count(*) FROM prestamos.prestamos p WHERE p.solicitante_id = usuario AND p.estado_cierre = 'abierto')
        + (SELECT count(*) FROM prestamos.reservas r WHERE r.solicitante_id = usuario
            AND r.estado = 'confirmada' AND r.id IS DISTINCT FROM excluir
            AND tstzrange(r.inicio, r.fin, '[)') @> puntos.instante) >= cupo
    );
$$;

CREATE FUNCTION prestamos.validar_reserva() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    titular prestamos.usuarios%ROWTYPE;
    unidad prestamos.unidades_inventario%ROWTYPE;
    politica prestamos.politicas_prestamo%ROWTYPE;
    es_admin boolean;
BEGIN
    PERFORM id FROM prestamos.usuarios WHERE id IN (NEW.solicitante_id, NEW.decidido_por) ORDER BY id FOR UPDATE;
    SELECT * INTO titular FROM prestamos.usuarios WHERE id = NEW.solicitante_id;
    SELECT * INTO unidad FROM prestamos.unidades_inventario WHERE id = NEW.unidad_id FOR UPDATE;
    IF TG_OP = 'INSERT' THEN
        IF NEW.estado <> 'solicitada' OR NEW.inicio <= clock_timestamp() THEN
            RAISE EXCEPTION 'Solicitar requiere un intervalo futuro y estado inicial' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF (to_jsonb(NEW) - ARRAY['estado','decidido_por','decidido_en','motivo'])
            IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado','decidido_por','decidido_en','motivo'])
            OR OLD.estado NOT IN ('solicitada', 'confirmada') OR OLD.fin <= clock_timestamp() THEN
            RAISE EXCEPTION 'Reserva finalizada, vencida o datos originales alterados' USING ERRCODE = '23514';
        END IF;
        IF NEW.estado = 'atendida' THEN
            IF OLD.estado <> 'confirmada' OR NOT EXISTS (
                SELECT 1 FROM prestamos.prestamos p WHERE p.reserva_id = NEW.id
                    AND p.solicitante_id = NEW.solicitante_id AND p.unidad_id = NEW.unidad_id
                    AND p.modalidad = NEW.modalidad AND p.inicio >= NEW.inicio AND p.vencimiento <= NEW.fin)
                OR NEW.decidido_por IS DISTINCT FROM OLD.decidido_por
                OR NEW.decidido_en IS DISTINCT FROM OLD.decidido_en OR NEW.motivo IS DISTINCT FROM OLD.motivo THEN
                RAISE EXCEPTION 'Atender requiere la entrega de la misma reserva' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END IF;
        SELECT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
            WHERE u.id = NEW.decidido_por AND u.activo AND p.activo AND u.atribucion_admin AND u.rol <> 'estudiante') INTO es_admin;
        IF NEW.estado IN ('confirmada','rechazada') THEN
            IF OLD.estado <> 'solicitada' OR NOT es_admin THEN
                RAISE EXCEPTION 'Confirmar o rechazar requiere solicitud pendiente y administrador' USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.estado = 'cancelada' THEN
            IF NOT es_admin AND NOT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
                WHERE u.id = NEW.decidido_por AND u.id = NEW.solicitante_id AND u.activo AND p.activo) THEN
                RAISE EXCEPTION 'Cancelar requiere al titular o administrador habilitado' USING ERRCODE = '23514';
            END IF;
        ELSE
            RAISE EXCEPTION 'Transición de reserva no permitida' USING ERRCODE = '23514';
        END IF;
        NEW.decidido_en := clock_timestamp();
        IF NEW.estado IN ('cancelada', 'rechazada') THEN RETURN NEW; END IF;
    END IF;
    IF NOT titular.activo OR titular.rol NOT IN ('docente','estudiante') OR NOT EXISTS (
        SELECT 1 FROM prestamos.personas WHERE id = titular.persona_id AND activo)
        OR NOT EXISTS (SELECT 1 FROM prestamos.perfiles_academicos pa LEFT JOIN prestamos.planes_estudio pe ON pe.id = pa.plan_id
            WHERE pa.usuario_id = titular.id AND pa.tipo = titular.rol AND pa.habilitado AND (pa.tipo = 'docente' OR pe.activo)) THEN
        RAISE EXCEPTION 'La reserva requiere un solicitante y perfil habilitados' USING ERRCODE = '23514';
    END IF;
    IF unidad.estado IN ('mantenimiento','baja') OR NOT EXISTS (
        SELECT 1 FROM prestamos.bienes b JOIN prestamos.tipos_bien t ON t.id = b.tipo_id WHERE b.id = unidad.bien_id AND t.habilitado) THEN
        RAISE EXCEPTION 'Unidad no habilitada para reservar' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO politica FROM prestamos.politicas_prestamo
        WHERE aprobada_en IS NOT NULL AND aprobada_en <= clock_timestamp()
            AND (rol = titular.rol OR rol IS NULL) AND tstzrange(vigencia_inicio, vigencia_fin, '[)') @> NEW.inicio
        ORDER BY rol NULLS LAST LIMIT 1 FOR SHARE;
    IF NOT FOUND OR NOT (NEW.modalidad = ANY(politica.modalidades))
        OR NEW.fin - NEW.inicio > make_interval(hours => politica.duracion_cantidad * CASE politica.duracion_unidad WHEN 'dias' THEN 24 ELSE 1 END) THEN
        RAISE EXCEPTION 'La reserva debe respetar la política aprobada para su inicio' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado = 'confirmada' THEN
        IF EXISTS (SELECT 1 FROM prestamos.prestamos WHERE unidad_id = NEW.unidad_id AND estado_cierre = 'abierto') THEN
            RAISE EXCEPTION 'Esperar la devolución real de la unidad antes de confirmar' USING ERRCODE = '23514';
        END IF;
        IF prestamos.cupo_reserva_excedido(NEW.solicitante_id, NEW.inicio, NEW.fin, politica.cupo_total, NEW.id) THEN
            RAISE EXCEPTION 'Cupo concurrente de préstamos y reservas alcanzado' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reserva_reglas BEFORE INSERT OR UPDATE ON prestamos.reservas
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_reserva();
CREATE TRIGGER auditar_cambio AFTER INSERT OR UPDATE OR DELETE ON prestamos.reservas
    FOR EACH ROW EXECUTE FUNCTION prestamos.auditar_cambio();

-- Una unidad fuera de servicio no conserva compromisos que ya no puede cumplir.
-- La cancelación y su auditoría se revierten también si falla la devolución/baja.
CREATE FUNCTION prestamos.cancelar_reservas_unidad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor bigint := NULLIF(current_setting('app.actor_usuario_id', true), '')::bigint;
BEGIN
    IF NEW.estado IN ('mantenimiento','baja') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
        UPDATE prestamos.reservas SET estado = 'cancelada', decidido_por = actor,
            decidido_en = clock_timestamp(), motivo = 'Unidad fuera de servicio: ' || NEW.estado
            WHERE unidad_id = NEW.id AND estado IN ('solicitada','confirmada') AND fin > clock_timestamp();
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER unidad_cancela_reservas AFTER UPDATE OF estado ON prestamos.unidades_inventario
    FOR EACH ROW EXECUTE FUNCTION prestamos.cancelar_reservas_unidad();

CREATE FUNCTION prestamos.validar_entrega_reserva() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reserva prestamos.reservas%ROWTYPE;
BEGIN
    -- validar_prestamo ya bloquea cuentas y unidad y conserva la política efectiva.
    IF NEW.reserva_id IS NOT NULL THEN
        SELECT * INTO reserva FROM prestamos.reservas WHERE id = NEW.reserva_id FOR UPDATE;
        IF NOT FOUND OR reserva.estado <> 'confirmada' OR reserva.solicitante_id <> NEW.solicitante_id
            OR reserva.unidad_id <> NEW.unidad_id OR reserva.modalidad <> NEW.modalidad
            OR NEW.inicio < reserva.inicio OR NEW.inicio >= reserva.fin OR NEW.vencimiento > reserva.fin THEN
            RAISE EXCEPTION 'Entrega incompatible con la reserva confirmada' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM prestamos.reservas r WHERE r.unidad_id = NEW.unidad_id AND r.estado = 'confirmada'
        AND r.id IS DISTINCT FROM NEW.reserva_id AND tstzrange(r.inicio, r.fin, '[)') && tstzrange(NEW.inicio, NEW.vencimiento, '[)')) THEN
        RAISE EXCEPTION 'La entrega se cruza con una reserva confirmada' USING ERRCODE = '23514';
    END IF;
    IF prestamos.cupo_reserva_excedido(NEW.solicitante_id, NEW.inicio, NEW.vencimiento, NEW.cupo_aplicado, NEW.reserva_id) THEN
        RAISE EXCEPTION 'La entrega excede el cupo incluyendo reservas confirmadas' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_entrega_reserva BEFORE INSERT ON prestamos.prestamos
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_entrega_reserva();
CREATE FUNCTION prestamos.atender_reserva() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.reserva_id IS NOT NULL THEN UPDATE prestamos.reservas SET estado = 'atendida' WHERE id = NEW.reserva_id; END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER entrega_atiende_reserva AFTER INSERT ON prestamos.prestamos
    FOR EACH ROW EXECUTE FUNCTION prestamos.atender_reserva();

CREATE VIEW prestamos.v_reservas_estado WITH (security_invoker = true) AS
SELECT r.*, CASE WHEN r.estado IN ('solicitada','confirmada') AND r.fin <= clock_timestamp()
    THEN 'vencida' ELSE r.estado END AS estado_actual FROM prestamos.reservas r;
CREATE OR REPLACE VIEW prestamos.v_disponibilidad_actual WITH (security_invoker = true) AS
SELECT u.id AS unidad_id, u.codigo_inventario, b.id AS bien_id, b.nombre,
    t.codigo AS tipo_codigo, t.nombre AS tipo_nombre, u.ubicacion, u.estado,
    (u.estado = 'disponible' AND t.habilitado AND NOT EXISTS (
        SELECT 1 FROM prestamos.prestamos p WHERE p.unidad_id = u.id AND p.estado_cierre = 'abierto'
    ) AND NOT EXISTS (SELECT 1 FROM prestamos.reservas r WHERE r.unidad_id = u.id AND r.estado = 'confirmada'
        AND tstzrange(r.inicio, r.fin, '[)') @> clock_timestamp())) AS disponible
FROM prestamos.unidades_inventario u JOIN prestamos.bienes b ON b.id = u.bien_id
JOIN prestamos.tipos_bien t ON t.id = b.tipo_id;
-- Conservar nombres, orden y tipos de las columnas existentes de la vista.
DO $$
DECLARE columnas text;
BEGIN
    SELECT string_agg('p.' || quote_ident(attname), ', ' ORDER BY attnum) INTO columnas
    FROM pg_attribute WHERE attrelid = 'prestamos.prestamos'::regclass AND attnum > 0 AND NOT attisdropped
        AND attname NOT IN ('devolucion_apta', 'destino_devolucion', 'reserva_id');
    EXECUTE format('CREATE OR REPLACE VIEW prestamos.v_prestamos_estado WITH (security_invoker = true) AS
        SELECT %s, CASE WHEN p.estado_cierre = ''devuelto'' THEN ''devuelto''
            WHEN p.vencimiento <= CURRENT_TIMESTAMP THEN ''vencido'' ELSE ''activo'' END AS estado,
        p.devolucion_apta, p.destino_devolucion,
        GREATEST(0, extract(epoch FROM (COALESCE(p.devolucion_en, CURRENT_TIMESTAMP) - p.vencimiento)))::numeric(20,6) AS retraso_segundos,
        GREATEST(0, extract(epoch FROM (COALESCE(p.devolucion_en, CURRENT_TIMESTAMP) - p.vencimiento)) - p.tolerancia_horas * 3600::numeric)::numeric(20,6) AS exceso_tolerancia_segundos,
        p.reserva_id FROM prestamos.prestamos p', columnas);
END;
$$;
