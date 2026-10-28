-- MySQL 8.4 / InnoDB.
-- El esquema seleccionado por DB_NAME es DBsistema_prestamos.
-- Orden: usuarios y soporte académico → catálogo → políticas → operaciones → auditoría.

-- ============================================================================
-- USUARIOS Y SOPORTE ACADÉMICO
-- ============================================================================

CREATE TABLE personas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    documento VARCHAR(32) NOT NULL UNIQUE,
    nombre_completo VARCHAR(200) NOT NULL,
    correo VARCHAR(254) NOT NULL,
    contacto VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CHECK (TRIM(documento) <> '' AND TRIM(nombre_completo) <> '')
) ENGINE = InnoDB;

CREATE TABLE usuarios (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    persona_id BIGINT NOT NULL UNIQUE,
    nombre_usuario VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    rol ENUM('personal_administrativo', 'docente', 'estudiante') NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    atribucion_admin BOOLEAN NOT NULL DEFAULT FALSE,
    atribucion_otorgada_en DATETIME(6),
    atribucion_otorgada_por BIGINT,
    ultimo_acceso_en DATETIME(6),
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    FOREIGN KEY (persona_id) REFERENCES personas(id),
    FOREIGN KEY (atribucion_otorgada_por) REFERENCES usuarios(id),

    CHECK (NOT (rol = 'estudiante' AND atribucion_admin)),
    CHECK (password_hash LIKE '$argon2id$%')
) ENGINE = InnoDB;

CREATE TABLE planes_estudio (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    programa VARCHAR(150) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE = InnoDB;

CREATE TABLE semestres_plan (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    plan_id BIGINT NOT NULL,
    numero SMALLINT NOT NULL,

    UNIQUE (plan_id, numero),
    FOREIGN KEY (plan_id) REFERENCES planes_estudio(id),
    CHECK (numero > 0)
) ENGINE = InnoDB;

CREATE TABLE perfiles_academicos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    tipo ENUM('estudiante', 'docente') NOT NULL,
    codigo VARCHAR(50) NOT NULL,
    habilitado BOOLEAN NOT NULL DEFAULT FALSE,
    plan_id BIGINT,
    semestre SMALLINT,
    especialidad VARCHAR(150),
    vinculacion VARCHAR(150),
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE (usuario_id, tipo),
    UNIQUE (tipo, codigo),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (plan_id, semestre) REFERENCES semestres_plan(plan_id, numero),

    CHECK (
        (tipo = 'estudiante' AND plan_id IS NOT NULL AND semestre IS NOT NULL)
        OR (tipo = 'docente' AND especialidad IS NOT NULL AND vinculacion IS NOT NULL)
    )
) ENGINE = InnoDB;

CREATE TABLE sesiones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expira_en DATETIME(6) NOT NULL,
    revocada_en DATETIME(6),

    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CHECK (expira_en > creado_en),
    INDEX (usuario_id, expira_en)
) ENGINE = InnoDB;

-- ============================================================================
-- CATÁLOGO E INVENTARIO
-- Una ficha describe el bien; cada unidad representa un ejemplar físico.
-- ============================================================================

CREATE TABLE tipos_bien (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo ENUM('libro', 'mesa_ping_pong', 'visor_3d', 'parlante', 'carrito_robotica') NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE = InnoDB;

INSERT INTO tipos_bien (codigo, nombre)
VALUES
    ('libro', 'Libro'),
    ('mesa_ping_pong', 'Mesa de ping-pong'),
    ('visor_3d', 'Visor 3D'),
    ('parlante', 'Parlante'),
    ('carrito_robotica', 'Carrito para robótica');

CREATE TABLE bienes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tipo_id BIGINT NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    autor VARCHAR(200),
    edicion VARCHAR(100),
    isbn VARCHAR(32),
    marca VARCHAR(100),
    modelo VARCHAR(100),
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    FOREIGN KEY (tipo_id) REFERENCES tipos_bien(id),
    INDEX (nombre),
    INDEX (isbn)
) ENGINE = InnoDB;

CREATE TABLE unidades_inventario (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    bien_id BIGINT NOT NULL,
    codigo_inventario VARCHAR(64) NOT NULL UNIQUE,
    custodia VARCHAR(30) NOT NULL DEFAULT 'escuela',
    adscrito_laboratorio BOOLEAN NOT NULL DEFAULT FALSE,
    ubicacion VARCHAR(200) NOT NULL,
    condicion_fisica TEXT NOT NULL,
    accesorios JSON NOT NULL,
    estado ENUM('disponible', 'prestada', 'mantenimiento', 'baja') NOT NULL DEFAULT 'disponible',
    serie VARCHAR(100),
    marca VARCHAR(100),
    modelo VARCHAR(100),
    adquirido_en DATE,
    baja_en DATETIME(6),
    motivo_baja TEXT,
    observaciones TEXT,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    FOREIGN KEY (bien_id) REFERENCES bienes(id),
    UNIQUE (marca, modelo, serie),
    INDEX (bien_id, estado),

    CHECK (custodia = 'escuela' AND NOT adscrito_laboratorio),
    CHECK (serie IS NULL OR (marca IS NOT NULL AND modelo IS NOT NULL)),
    CHECK (JSON_TYPE(accesorios) = 'ARRAY'),
    CHECK (
        (estado = 'baja' AND baja_en IS NOT NULL AND motivo_baja IS NOT NULL)
        OR (estado <> 'baja' AND baja_en IS NULL AND motivo_baja IS NULL)
    )
) ENGINE = InnoDB;

-- ============================================================================
-- POLÍTICAS DE PRÉSTAMO
-- Una fila estable por alcance serializa la aprobación sin bloqueos globales.
-- ============================================================================

CREATE TABLE alcances_politica (
    nombre VARCHAR(30) PRIMARY KEY
) ENGINE = InnoDB;

INSERT INTO alcances_politica
VALUES
    ('general'),
    ('estudiante'),
    ('docente');

CREATE TABLE politicas_prestamo (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    rol ENUM('estudiante', 'docente'),
    alcance VARCHAR(30) GENERATED ALWAYS AS (COALESCE(rol, 'general')) STORED,
    version INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    vigencia_inicio DATETIME(6) NOT NULL,
    vigencia_fin DATETIME(6),
    aprobada_en DATETIME(6),
    aprobada_por BIGINT,
    cupo_total SMALLINT NOT NULL,
    duracion_cantidad INT NOT NULL,
    duracion_unidad ENUM('horas', 'dias') NOT NULL,
    modalidades JSON NOT NULL,
    garantia_exigida BOOLEAN NOT NULL DEFAULT FALSE,
    renovacion_permitida BOOLEAN NOT NULL DEFAULT FALSE,
    max_renovaciones INT NOT NULL DEFAULT 0,
    tolerancia_horas INT NOT NULL DEFAULT 0,
    tarifa_diaria DECIMAL(12, 2) NOT NULL DEFAULT 0,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    UNIQUE (alcance, version),
    FOREIGN KEY (aprobada_por) REFERENCES usuarios(id),

    CHECK (
        cupo_total > 0
        AND duracion_cantidad > 0
        AND duracion_cantidad <= 36500
        AND tolerancia_horas >= 0
    ),
    CHECK (vigencia_fin IS NULL OR vigencia_fin > vigencia_inicio),
    -- Las funciones fuera de alcance no pueden exigirse desde una política.
    CHECK (
        NOT garantia_exigida
        AND NOT renovacion_permitida
        AND max_renovaciones = 0
        AND tarifa_diaria = 0
    )
) ENGINE = InnoDB;

-- ============================================================================
-- RESERVAS Y PRÉSTAMOS
-- El orden permite referenciar la reserva desde su préstamo de origen.
-- ============================================================================

CREATE TABLE reservas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    solicitante_id BIGINT NOT NULL,
    unidad_id BIGINT NOT NULL,
    inicio DATETIME(6) NOT NULL,
    fin DATETIME(6) NOT NULL,
    uso_previsto TEXT NOT NULL,
    estado ENUM('pendiente', 'confirmada', 'rechazada', 'cancelada', 'atendida', 'vencida')
        NOT NULL DEFAULT 'pendiente',
    creada_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    decidida_por BIGINT,
    decidida_en DATETIME(6),
    motivo_decision TEXT,
    cancelada_por BIGINT,
    cancelada_en DATETIME(6),
    motivo_cancelacion TEXT,

    UNIQUE (id, solicitante_id, unidad_id),
    FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
    FOREIGN KEY (unidad_id) REFERENCES unidades_inventario(id),
    FOREIGN KEY (decidida_por) REFERENCES usuarios(id),
    FOREIGN KEY (cancelada_por) REFERENCES usuarios(id),

    CHECK (fin > inicio),
    CHECK (
        estado <> 'rechazada'
        OR (motivo_decision IS NOT NULL AND decidida_por IS NOT NULL)
    ),
    INDEX (unidad_id, estado, inicio, fin),
    INDEX (solicitante_id, estado, inicio, fin)
) ENGINE = InnoDB;

CREATE TABLE prestamos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    solicitante_id BIGINT NOT NULL,
    autorizado_por BIGINT NOT NULL,
    unidad_id BIGINT NOT NULL,
    reserva_id BIGINT UNIQUE,
    inicio DATETIME(6) NOT NULL,
    vencimiento DATETIME(6) NOT NULL,
    estado_cierre ENUM('abierto', 'devuelto') NOT NULL DEFAULT 'abierto',

    -- MySQL admite varios NULL: solo los abiertos participan de la unicidad.
    unidad_abierta BIGINT GENERATED ALWAYS AS (
        CASE WHEN estado_cierre = 'abierto' THEN unidad_id ELSE NULL END
    ) STORED UNIQUE,

    modalidad ENUM('en_sitio', 'retiro') NOT NULL,
    condicion_entrega TEXT NOT NULL,
    accesorios_entrega JSON NOT NULL,
    observaciones_entrega TEXT,
    politica_condiciones_id BIGINT NOT NULL,
    politica_cupo_id BIGINT NOT NULL,
    rol_origen VARCHAR(20) NOT NULL,
    cupo_aplicado SMALLINT NOT NULL,
    duracion_max_horas INT NOT NULL,
    garantia_exigida BOOLEAN NOT NULL DEFAULT FALSE,
    renovacion_permitida BOOLEAN NOT NULL DEFAULT FALSE,
    max_renovaciones INT NOT NULL DEFAULT 0,
    tolerancia_horas INT NOT NULL DEFAULT 0,
    tarifa_diaria DECIMAL(12, 2) NOT NULL DEFAULT 0,
    devolucion_en DATETIME(6),
    recibido_por BIGINT,
    condicion_devolucion TEXT,
    accesorios_devolucion JSON,
    observaciones_devolucion TEXT,
    devolucion_apta BOOLEAN,
    destino_devolucion VARCHAR(20),
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    FOREIGN KEY (solicitante_id) REFERENCES usuarios(id),
    FOREIGN KEY (autorizado_por) REFERENCES usuarios(id),
    FOREIGN KEY (unidad_id) REFERENCES unidades_inventario(id),
    FOREIGN KEY (recibido_por) REFERENCES usuarios(id),
    FOREIGN KEY (reserva_id, solicitante_id, unidad_id)
        REFERENCES reservas(id, solicitante_id, unidad_id),
    FOREIGN KEY (politica_condiciones_id) REFERENCES politicas_prestamo(id),
    FOREIGN KEY (politica_cupo_id) REFERENCES politicas_prestamo(id),

    CHECK (vencimiento > inicio),
    CHECK (
        (estado_cierre = 'abierto' AND devolucion_en IS NULL)
        OR (
            estado_cierre = 'devuelto'
            AND devolucion_en >= inicio
            AND recibido_por IS NOT NULL
            AND devolucion_apta IS NOT NULL
            AND destino_devolucion IS NOT NULL
        )
    ),
    CHECK (devolucion_apta IS NULL OR devolucion_apta OR destino_devolucion <> 'disponible'),
    INDEX (solicitante_id, estado_cierre),
    INDEX (vencimiento)
) ENGINE = InnoDB;

-- ============================================================================
-- AUDITORÍA
-- Cada evento identifica a un usuario o a un proceso técnico, nunca a ambos.
-- ============================================================================

CREATE TABLE eventos_historial (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_usuario_id BIGINT,
    actor_proceso VARCHAR(150),
    entidad VARCHAR(80) NOT NULL,
    entidad_id VARCHAR(100) NOT NULL,
    accion VARCHAR(100) NOT NULL,
    resultado ENUM('exito', 'rechazado', 'error') NOT NULL DEFAULT 'exito',
    detalle JSON NOT NULL,
    creado_en DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    FOREIGN KEY (actor_usuario_id) REFERENCES usuarios(id),
    CHECK ((actor_usuario_id IS NULL) <> (actor_proceso IS NULL)),
    INDEX (entidad, entidad_id, creado_en)
) ENGINE = InnoDB;
