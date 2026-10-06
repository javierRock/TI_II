-- Primer avance: una unidad por préstamo, entregas directas y devoluciones.
-- PostgreSQL >= 15. No se habilitan reservas, renovaciones, garantías ni sanciones.
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE SCHEMA prestamos;
REVOKE ALL ON SCHEMA prestamos FROM PUBLIC;

CREATE TABLE prestamos.personas (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento varchar(32) NOT NULL,
    nombre_completo varchar(200) NOT NULL,
    correo varchar(254) NOT NULL,
    contacto varchar(100),
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT persona_documento_valido CHECK (documento = btrim(documento) AND documento <> ''),
    CONSTRAINT persona_nombre_valido CHECK (btrim(nombre_completo) <> ''),
    CONSTRAINT persona_correo_valido CHECK (correo = btrim(correo) AND correo LIKE '%_@_%._%')
);
CREATE UNIQUE INDEX persona_documento_unico ON prestamos.personas (upper(documento));

CREATE TABLE prestamos.usuarios (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    persona_id bigint NOT NULL UNIQUE REFERENCES prestamos.personas(id) ON DELETE RESTRICT,
    nombre_usuario varchar(64) NOT NULL,
    password_hash text NOT NULL,
    rol varchar(30) NOT NULL,
    activo boolean NOT NULL DEFAULT true,
    atribucion_admin boolean NOT NULL DEFAULT false,
    atribucion_otorgada_en timestamptz,
    atribucion_otorgada_por bigint REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    ultimo_acceso_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuario_nombre_valido CHECK (nombre_usuario = btrim(nombre_usuario) AND nombre_usuario <> ''),
    CONSTRAINT usuario_hash_argon2id CHECK (password_hash LIKE '$argon2id$%' AND length(password_hash) >= 32),
    CONSTRAINT usuario_rol_valido CHECK (rol IN ('personal_administrativo', 'docente', 'estudiante')),
    CONSTRAINT estudiante_sin_atribucion_admin CHECK (NOT (rol = 'estudiante' AND atribucion_admin)),
    CONSTRAINT atribucion_admin_documentada CHECK (NOT atribucion_admin OR (atribucion_otorgada_en IS NOT NULL AND atribucion_otorgada_por IS NOT NULL))
);
CREATE UNIQUE INDEX usuario_nombre_unico ON prestamos.usuarios (lower(nombre_usuario));
CREATE INDEX usuario_rol_idx ON prestamos.usuarios (rol);

CREATE TABLE prestamos.planes_estudio (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo varchar(50) NOT NULL UNIQUE CHECK (codigo = btrim(codigo) AND codigo <> ''),
    programa varchar(150) NOT NULL CHECK (btrim(programa) <> ''),
    nombre varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prestamos.semestres_plan (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan_id bigint NOT NULL REFERENCES prestamos.planes_estudio(id) ON DELETE RESTRICT,
    numero smallint NOT NULL CHECK (numero > 0),
    CONSTRAINT semestre_plan_unico UNIQUE (plan_id, numero)
);

CREATE TABLE prestamos.perfiles_academicos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id bigint NOT NULL REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    tipo varchar(20) NOT NULL CHECK (tipo IN ('estudiante', 'docente')),
    codigo varchar(50) NOT NULL CHECK (codigo = btrim(codigo) AND codigo <> ''),
    habilitado boolean NOT NULL DEFAULT false,
    plan_id bigint,
    semestre smallint,
    especialidad varchar(150),
    vinculacion varchar(150),
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT perfil_usuario_tipo_unico UNIQUE (usuario_id, tipo),
    CONSTRAINT perfil_semestre_valido FOREIGN KEY (plan_id, semestre)
        REFERENCES prestamos.semestres_plan(plan_id, numero) ON DELETE RESTRICT,
    CONSTRAINT perfil_datos_por_tipo CHECK (
        (tipo = 'estudiante' AND plan_id IS NOT NULL AND semestre IS NOT NULL AND especialidad IS NULL AND vinculacion IS NULL)
        OR (tipo = 'docente' AND plan_id IS NULL AND semestre IS NULL
            AND especialidad IS NOT NULL AND btrim(especialidad) <> ''
            AND vinculacion IS NOT NULL AND btrim(vinculacion) <> '')
    )
);
CREATE UNIQUE INDEX perfil_codigo_unico ON prestamos.perfiles_academicos (tipo, upper(codigo));
CREATE INDEX perfil_plan_idx ON prestamos.perfiles_academicos (plan_id, semestre);

CREATE TABLE prestamos.sesiones (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id bigint NOT NULL REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en timestamptz NOT NULL,
    revocada_en timestamptz,
    CONSTRAINT sesion_expiracion_valida CHECK (expira_en > creado_en),
    CONSTRAINT sesion_revocacion_valida CHECK (revocada_en IS NULL OR revocada_en >= creado_en)
);
CREATE INDEX sesion_usuario_vigente_idx ON prestamos.sesiones (usuario_id, expira_en) WHERE revocada_en IS NULL;

CREATE TABLE prestamos.tipos_bien (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    codigo varchar(40) NOT NULL UNIQUE,
    nombre varchar(100) NOT NULL UNIQUE CHECK (btrim(nombre) <> ''),
    descripcion text,
    habilitado boolean NOT NULL DEFAULT true,
    CONSTRAINT tipo_bien_alcance CHECK (codigo IN ('libro', 'mesa_ping_pong', 'visor_3d', 'parlante', 'carrito_robotica'))
);

CREATE TABLE prestamos.bienes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_id bigint NOT NULL REFERENCES prestamos.tipos_bien(id) ON DELETE RESTRICT,
    nombre varchar(200) NOT NULL CHECK (btrim(nombre) <> ''),
    descripcion text,
    autor varchar(200),
    edicion varchar(100),
    isbn varchar(32),
    marca varchar(100),
    modelo varchar(100),
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bien_marca_valida CHECK (marca IS NULL OR (marca = btrim(marca) AND marca <> '')),
    CONSTRAINT bien_modelo_valido CHECK (modelo IS NULL OR (modelo = btrim(modelo) AND modelo <> ''))
);
CREATE INDEX bien_tipo_idx ON prestamos.bienes (tipo_id);
CREATE INDEX bien_nombre_idx ON prestamos.bienes (lower(nombre) text_pattern_ops);
-- ISBN deliberadamente NO UNIQUE: no identifica un ejemplar.
CREATE INDEX bien_isbn_idx ON prestamos.bienes (isbn) WHERE isbn IS NOT NULL;

CREATE TABLE prestamos.unidades_inventario (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    bien_id bigint NOT NULL REFERENCES prestamos.bienes(id) ON DELETE RESTRICT,
    codigo_inventario varchar(64) NOT NULL CHECK (codigo_inventario = btrim(codigo_inventario) AND codigo_inventario <> ''),
    custodia varchar(30) NOT NULL DEFAULT 'escuela' CHECK (custodia = 'escuela'),
    adscrito_laboratorio boolean NOT NULL DEFAULT false CHECK (NOT adscrito_laboratorio),
    ubicacion varchar(200) NOT NULL CHECK (btrim(ubicacion) <> ''),
    condicion_fisica text NOT NULL CHECK (btrim(condicion_fisica) <> ''),
    accesorios jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(accesorios) = 'array'),
    estado varchar(20) NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible', 'prestada', 'mantenimiento', 'baja')),
    serie varchar(100),
    marca varchar(100),
    modelo varchar(100),
    adquirido_en date,
    baja_en timestamptz,
    motivo_baja text,
    observaciones text,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unidad_serie_identificada CHECK (serie IS NULL OR (
        serie = btrim(serie) AND serie <> ''
        AND marca IS NOT NULL AND marca = btrim(marca) AND marca <> ''
        AND modelo IS NOT NULL AND modelo = btrim(modelo) AND modelo <> ''
    )),
    CONSTRAINT unidad_baja_documentada CHECK (
        (estado = 'baja' AND baja_en IS NOT NULL AND motivo_baja IS NOT NULL AND btrim(motivo_baja) <> '')
        OR (estado <> 'baja' AND baja_en IS NULL AND motivo_baja IS NULL)
    )
);
CREATE UNIQUE INDEX unidad_codigo_unico ON prestamos.unidades_inventario (upper(codigo_inventario));
CREATE UNIQUE INDEX unidad_identidad_tecnica_unica ON prestamos.unidades_inventario (lower(marca), lower(modelo), lower(serie)) WHERE serie IS NOT NULL;
CREATE INDEX unidad_bien_estado_idx ON prestamos.unidades_inventario (bien_id, estado);
CREATE INDEX unidad_estado_idx ON prestamos.unidades_inventario (estado);

CREATE TABLE prestamos.politicas_prestamo (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rol varchar(20) CHECK (rol IN ('estudiante', 'docente')),
    version integer NOT NULL CHECK (version > 0),
    nombre varchar(150) NOT NULL CHECK (btrim(nombre) <> ''),
    vigencia_inicio timestamptz NOT NULL,
    vigencia_fin timestamptz,
    aprobada_en timestamptz,
    aprobada_por bigint REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    cupo_total smallint NOT NULL CHECK (cupo_total > 0),
    duracion_cantidad integer NOT NULL CHECK (duracion_cantidad > 0 AND duracion_cantidad <= 36500),
    duracion_unidad varchar(5) NOT NULL CHECK (duracion_unidad IN ('horas', 'dias')),
    modalidades text[] NOT NULL,
    garantia_exigida boolean NOT NULL DEFAULT false,
    renovacion_permitida boolean NOT NULL DEFAULT false,
    max_renovaciones integer NOT NULL DEFAULT 0 CHECK (max_renovaciones >= 0),
    tolerancia_horas integer NOT NULL DEFAULT 0 CHECK (tolerancia_horas >= 0),
    tarifa_diaria numeric(12,2) NOT NULL DEFAULT 0 CHECK (tarifa_diaria >= 0),
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT politica_version_unica UNIQUE NULLS NOT DISTINCT (rol, version),
    CONSTRAINT politica_intervalo_valido CHECK (vigencia_fin IS NULL OR vigencia_fin > vigencia_inicio),
    CONSTRAINT politica_aprobacion_completa CHECK ((aprobada_en IS NULL) = (aprobada_por IS NULL)),
    CONSTRAINT politica_modalidades_validas CHECK (cardinality(modalidades) > 0 AND modalidades <@ ARRAY['en_sitio', 'retiro']::text[] AND array_position(modalidades, NULL) IS NULL),
    CONSTRAINT politica_primer_avance CHECK (NOT garantia_exigida AND NOT renovacion_permitida AND max_renovaciones = 0 AND tarifa_diaria = 0),
    CONSTRAINT politica_vigencias_sin_solapamiento EXCLUDE USING gist (
        (COALESCE(rol, 'general')) WITH =,
        tstzrange(vigencia_inicio, vigencia_fin, '[)') WITH &&
    ) WHERE (aprobada_en IS NOT NULL)
);

CREATE TABLE prestamos.prestamos (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    solicitante_id bigint NOT NULL REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    autorizado_por bigint NOT NULL REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    unidad_id bigint NOT NULL REFERENCES prestamos.unidades_inventario(id) ON DELETE RESTRICT,
    inicio timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    vencimiento timestamptz NOT NULL,
    estado_cierre varchar(20) NOT NULL DEFAULT 'abierto' CHECK (estado_cierre IN ('abierto', 'devuelto')),
    modalidad varchar(20) NOT NULL CHECK (modalidad IN ('en_sitio', 'retiro')),
    condicion_entrega text NOT NULL CHECK (btrim(condicion_entrega) <> ''),
    accesorios_entrega jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(accesorios_entrega) = 'array'),
    observaciones_entrega text,
    politica_condiciones_id bigint NOT NULL REFERENCES prestamos.politicas_prestamo(id) ON DELETE RESTRICT,
    politica_cupo_id bigint NOT NULL REFERENCES prestamos.politicas_prestamo(id) ON DELETE RESTRICT,
    rol_origen varchar(20) NOT NULL CHECK (rol_origen IN ('estudiante', 'docente')),
    cupo_aplicado smallint NOT NULL CHECK (cupo_aplicado > 0),
    duracion_max_horas integer NOT NULL CHECK (duracion_max_horas > 0),
    garantia_exigida boolean NOT NULL CHECK (NOT garantia_exigida),
    renovacion_permitida boolean NOT NULL CHECK (NOT renovacion_permitida),
    max_renovaciones integer NOT NULL CHECK (max_renovaciones = 0),
    tolerancia_horas integer NOT NULL CHECK (tolerancia_horas >= 0),
    tarifa_diaria numeric(12,2) NOT NULL CHECK (tarifa_diaria = 0),
    devolucion_en timestamptz,
    recibido_por bigint REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    condicion_devolucion text,
    accesorios_devolucion jsonb,
    observaciones_devolucion text,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT prestamo_vencimiento_valido CHECK (vencimiento > inicio AND vencimiento <= inicio + make_interval(hours => duracion_max_horas)),
    CONSTRAINT prestamo_cierre_completo CHECK (
        (estado_cierre = 'abierto' AND devolucion_en IS NULL AND recibido_por IS NULL
            AND condicion_devolucion IS NULL AND accesorios_devolucion IS NULL AND observaciones_devolucion IS NULL)
        OR (estado_cierre = 'devuelto' AND devolucion_en IS NOT NULL AND devolucion_en >= inicio
            AND recibido_por IS NOT NULL AND condicion_devolucion IS NOT NULL AND btrim(condicion_devolucion) <> ''
            AND accesorios_devolucion IS NOT NULL AND jsonb_typeof(accesorios_devolucion) = 'array')
    )
);
CREATE UNIQUE INDEX prestamo_unico_abierto_por_unidad ON prestamos.prestamos (unidad_id) WHERE estado_cierre = 'abierto';
CREATE INDEX prestamo_solicitante_estado_idx ON prestamos.prestamos (solicitante_id, estado_cierre, inicio DESC);
CREATE INDEX prestamo_vencimientos_idx ON prestamos.prestamos (vencimiento) WHERE estado_cierre = 'abierto';
CREATE INDEX prestamo_unidad_historial_idx ON prestamos.prestamos (unidad_id, inicio DESC);
CREATE INDEX prestamo_autorizante_idx ON prestamos.prestamos (autorizado_por);
CREATE INDEX prestamo_receptor_idx ON prestamos.prestamos (recibido_por) WHERE recibido_por IS NOT NULL;
CREATE INDEX prestamo_politica_condiciones_idx ON prestamos.prestamos (politica_condiciones_id);
CREATE INDEX prestamo_politica_cupo_idx ON prestamos.prestamos (politica_cupo_id);

CREATE TABLE prestamos.eventos_historial (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_usuario_id bigint REFERENCES prestamos.usuarios(id) ON DELETE RESTRICT,
    actor_proceso varchar(150),
    entidad varchar(80) NOT NULL CHECK (btrim(entidad) <> ''),
    entidad_id varchar(100) NOT NULL CHECK (btrim(entidad_id) <> ''),
    accion varchar(100) NOT NULL CHECK (btrim(accion) <> ''),
    resultado varchar(20) NOT NULL DEFAULT 'exito' CHECK (resultado IN ('exito', 'rechazado', 'error')),
    detalle jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detalle) = 'object'),
    corrige_evento_id bigint REFERENCES prestamos.eventos_historial(id) ON DELETE RESTRICT,
    creado_en timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT evento_actor_identificado CHECK (
        (actor_usuario_id IS NOT NULL AND actor_proceso IS NULL)
        OR (actor_usuario_id IS NULL AND actor_proceso IS NOT NULL AND btrim(actor_proceso) <> '')
    )
);
CREATE INDEX evento_entidad_idx ON prestamos.eventos_historial (entidad, entidad_id, creado_en DESC);
CREATE INDEX evento_actor_idx ON prestamos.eventos_historial (actor_usuario_id, creado_en DESC) WHERE actor_usuario_id IS NOT NULL;
CREATE INDEX evento_fecha_idx ON prestamos.eventos_historial (creado_en DESC);

-- Nunca incluir hash de contraseña ni identificadores secretos de sesiones.
CREATE FUNCTION prestamos.auditar_cambio() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    anterior jsonb;
    nuevo jsonb;
    registro jsonb;
    actor bigint := NULLIF(current_setting('app.actor_usuario_id', true), '')::bigint;
    proceso text := NULLIF(current_setting('app.actor_proceso', true), '');
BEGIN
    IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD) - 'password_hash'; END IF;
    IF TG_OP <> 'DELETE' THEN nuevo := to_jsonb(NEW) - 'password_hash'; END IF;
    registro := COALESCE(nuevo, anterior);
    IF actor IS NULL THEN proceso := COALESCE(proceso, 'sql:' || session_user); ELSE proceso := NULL; END IF;
    INSERT INTO prestamos.eventos_historial (actor_usuario_id, actor_proceso, entidad, entidad_id, accion, detalle)
    VALUES (actor, proceso, TG_TABLE_NAME, registro ->> 'id', lower(TG_OP), jsonb_build_object('anterior', anterior, 'nuevo', nuevo));
    RETURN NULL;
END;
$$;

CREATE FUNCTION prestamos.proteger_historial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'El historial es de solo adición; registrar una rectificación como evento nuevo' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER historial_inmutable BEFORE UPDATE OR DELETE OR TRUNCATE ON prestamos.eventos_historial
    FOR EACH STATEMENT EXECUTE FUNCTION prestamos.proteger_historial();

CREATE FUNCTION prestamos.validar_cuenta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.activo AND NOT EXISTS (SELECT 1 FROM prestamos.personas WHERE id = NEW.persona_id AND activo) THEN
        RAISE EXCEPTION 'Una cuenta activa requiere una persona activa' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER cuenta_persona_activa BEFORE INSERT OR UPDATE ON prestamos.usuarios
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_cuenta();

CREATE FUNCTION prestamos.desactivar_cuentas() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.activo AND NOT NEW.activo THEN
        UPDATE prestamos.usuarios SET activo = false WHERE persona_id = NEW.id AND activo;
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER persona_desactiva_cuenta AFTER UPDATE OF activo ON prestamos.personas
    FOR EACH ROW EXECUTE FUNCTION prestamos.desactivar_cuentas();

CREATE FUNCTION prestamos.revocar_sesiones() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.activo AND NOT NEW.activo) OR OLD.rol <> NEW.rol OR OLD.atribucion_admin <> NEW.atribucion_admin THEN
        UPDATE prestamos.sesiones SET revocada_en = clock_timestamp() WHERE usuario_id = NEW.id AND revocada_en IS NULL;
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER cuenta_revoca_sesiones AFTER UPDATE ON prestamos.usuarios
    FOR EACH ROW EXECUTE FUNCTION prestamos.revocar_sesiones();

CREATE FUNCTION prestamos.validar_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
        WHERE u.id = NEW.usuario_id AND u.activo AND p.activo) THEN
        RAISE EXCEPTION 'No se puede crear una sesión para una cuenta inactiva' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER sesion_cuenta_activa BEFORE INSERT ON prestamos.sesiones
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_sesion();

CREATE FUNCTION prestamos.validar_unidad() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ficha prestamos.bienes%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.estado = 'baja' AND NEW IS DISTINCT FROM OLD THEN
            RAISE EXCEPTION 'La baja de una unidad es terminal' USING ERRCODE = '23514';
        END IF;
        IF ROW(NEW.bien_id, NEW.codigo_inventario, NEW.serie, NEW.marca, NEW.modelo)
            IS DISTINCT FROM ROW(OLD.bien_id, OLD.codigo_inventario, OLD.serie, OLD.marca, OLD.modelo)
            AND EXISTS (SELECT 1 FROM prestamos.prestamos WHERE unidad_id = OLD.id) THEN
            RAISE EXCEPTION 'No modificar la identidad de una unidad con historial de préstamos' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.serie IS NOT NULL THEN
        SELECT * INTO ficha FROM prestamos.bienes WHERE id = NEW.bien_id;
        -- Copia de la identidad física: no cambia si luego se edita la ficha.
        NEW.marca := COALESCE(NEW.marca, ficha.marca);
        NEW.modelo := COALESCE(NEW.modelo, ficha.modelo);
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER unidad_identidad BEFORE INSERT OR UPDATE ON prestamos.unidades_inventario
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_unidad();

CREATE FUNCTION prestamos.validar_politica() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF NEW.aprobada_en IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
        WHERE u.id = NEW.aprobada_por AND u.activo AND p.activo AND u.atribucion_admin
    ) THEN
        RAISE EXCEPTION 'La aprobación requiere un administrador habilitado' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER politica_version_protegida BEFORE INSERT OR UPDATE ON prestamos.politicas_prestamo
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_politica();

CREATE FUNCTION prestamos.validar_prestamo() RETURNS trigger LANGUAGE plpgsql AS $$
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
        IF (to_jsonb(NEW) - ARRAY['estado_cierre', 'devolucion_en', 'recibido_por', 'condicion_devolucion', 'accesorios_devolucion', 'observaciones_devolucion'])
            IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['estado_cierre', 'devolucion_en', 'recibido_por', 'condicion_devolucion', 'accesorios_devolucion', 'observaciones_devolucion']) THEN
            RAISE EXCEPTION 'La entrega y sus condiciones históricas son inmutables' USING ERRCODE = '23514';
        END IF;
        IF NEW.estado_cierre = 'devuelto' AND NOT EXISTS (
            SELECT 1 FROM prestamos.usuarios u JOIN prestamos.personas p ON p.id = u.persona_id
            WHERE u.id = NEW.recibido_por AND u.activo AND p.activo AND u.atribucion_admin
        ) THEN
            RAISE EXCEPTION 'La devolución requiere un administrador habilitado' USING ERRCODE = '23514';
        END IF;
        IF NEW.devolucion_en > clock_timestamp() THEN
            RAISE EXCEPTION 'La devolución real no puede estar en el futuro' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    -- Serializar cupo y disponibilidad. Orden estable para las cuentas involucradas.
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
    IF unidad.estado <> 'disponible' OR NOT EXISTS (
        SELECT 1 FROM prestamos.bienes b JOIN prestamos.tipos_bien t ON t.id = b.tipo_id
        WHERE b.id = unidad.bien_id AND t.habilitado
    ) THEN
        RAISE EXCEPTION 'La unidad no está disponible o su tipo no está habilitado' USING ERRCODE = '23514';
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
    IF abiertos >= politica.cupo_total THEN
        RAISE EXCEPTION 'El solicitante alcanzó su cupo total' USING ERRCODE = '23514';
    END IF;
    -- El motor conserva los valores efectivos: nunca confiar en una copia del navegador.
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
CREATE TRIGGER prestamo_reglas_integridad BEFORE INSERT OR UPDATE ON prestamos.prestamos
    FOR EACH ROW EXECUTE FUNCTION prestamos.validar_prestamo();

-- Comprobar el estado FINAL de la transacción, no sus pasos intermedios.
CREATE FUNCTION prestamos.comprobar_unidad_prestamo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    unidad_id_afectada bigint;
    estado_actual text;
    tiene_abierto boolean;
BEGIN
    IF TG_TABLE_NAME = 'prestamos' THEN unidad_id_afectada := NEW.unidad_id;
    ELSE unidad_id_afectada := NEW.id; END IF;
    SELECT estado INTO estado_actual FROM prestamos.unidades_inventario WHERE id = unidad_id_afectada;
    SELECT EXISTS (SELECT 1 FROM prestamos.prestamos WHERE unidad_id = unidad_id_afectada AND estado_cierre = 'abierto') INTO tiene_abierto;
    IF (estado_actual = 'prestada') IS DISTINCT FROM tiene_abierto THEN
        RAISE EXCEPTION 'El estado de la unidad y su préstamo abierto deben cambiar juntos' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER unidad_prestamo_consistente AFTER INSERT OR UPDATE ON prestamos.unidades_inventario
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prestamos.comprobar_unidad_prestamo();
CREATE CONSTRAINT TRIGGER prestamo_unidad_consistente AFTER INSERT OR UPDATE ON prestamos.prestamos
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION prestamos.comprobar_unidad_prestamo();

DO $$
DECLARE tabla text;
BEGIN
    FOREACH tabla IN ARRAY ARRAY['personas', 'usuarios', 'planes_estudio', 'semestres_plan',
        'perfiles_academicos', 'tipos_bien', 'bienes', 'unidades_inventario', 'politicas_prestamo', 'prestamos'] LOOP
        EXECUTE format('CREATE TRIGGER auditar_cambio AFTER INSERT OR UPDATE OR DELETE ON prestamos.%I FOR EACH ROW EXECUTE FUNCTION prestamos.auditar_cambio()', tabla);
    END LOOP;
END;
$$;

CREATE VIEW prestamos.v_prestamos_estado WITH (security_invoker = true) AS
SELECT p.*, CASE WHEN estado_cierre = 'devuelto' THEN 'devuelto'
    WHEN vencimiento <= CURRENT_TIMESTAMP THEN 'vencido' ELSE 'activo' END AS estado
FROM prestamos.prestamos p;

CREATE VIEW prestamos.v_disponibilidad_actual WITH (security_invoker = true) AS
SELECT u.id AS unidad_id, u.codigo_inventario, b.id AS bien_id, b.nombre,
    t.codigo AS tipo_codigo, t.nombre AS tipo_nombre, u.ubicacion, u.estado,
    (u.estado = 'disponible' AND t.habilitado AND NOT EXISTS (
        SELECT 1 FROM prestamos.prestamos p WHERE p.unidad_id = u.id AND p.estado_cierre = 'abierto'
    )) AS disponible
FROM prestamos.unidades_inventario u JOIN prestamos.bienes b ON b.id = u.bien_id
JOIN prestamos.tipos_bien t ON t.id = b.tipo_id;

COMMENT ON SCHEMA prestamos IS 'Núcleo MVP de préstamos de bienes de la Escuela; no dinero ni laboratorios.';
COMMENT ON TABLE prestamos.perfiles_academicos IS 'Un perfil por usuario y tipo; el rol actual determina cuál habilita solicitudes.';
COMMENT ON TABLE prestamos.semestres_plan IS 'Semestres autorizados por plan; no existe un rango académico fijo inventado.';
COMMENT ON TABLE prestamos.sesiones IS 'Solo hash SHA-256 del secreto de sesión; no registrar tokens originales.';
COMMENT ON COLUMN prestamos.unidades_inventario.marca IS 'Identidad física conservada para controlar marca-modelo-serie, independiente de cambios descriptivos del catálogo.';
COMMENT ON TABLE prestamos.politicas_prestamo IS 'rol NULL: general. Condiciones aprobadas inmutables; se permite acortar vigencia a una fecha futura.';
COMMENT ON CONSTRAINT politica_primer_avance ON prestamos.politicas_prestamo IS 'Rechaza políticas cuyas obligaciones aún no están implementadas. Ampliar con migración cuando existan los módulos.';
COMMENT ON TABLE prestamos.prestamos IS 'Una unidad por operación. Condiciones efectivas copiadas al entregar. Vencido sigue abierto y consume cupo.';
COMMENT ON VIEW prestamos.v_disponibilidad_actual IS 'Disponibilidad física actual sin datos de solicitantes. NO calcula intervalos futuros; pendiente del módulo reservas.';
COMMENT ON TABLE prestamos.eventos_historial IS 'Auditoría automática en la misma transacción. Solo adición; sin contraseñas ni secretos de sesión. Un superusuario puede alterar estas protecciones.';

INSERT INTO prestamos.tipos_bien (codigo, nombre, descripcion) VALUES
    ('libro', 'Libro', 'Ejemplares físicos identificados por código de inventario.'),
    ('mesa_ping_pong', 'Mesa de ping-pong', 'Modalidad de uso sujeta a política aprobada.'),
    ('visor_3d', 'Visor 3D', 'Solo unidades bajo custodia de la Escuela.'),
    ('parlante', 'Parlante', 'Accesorios incluidos en la unidad prestable.'),
    ('carrito_robotica', 'Carrito para robótica', 'No se admiten unidades adscritas a laboratorios.');
