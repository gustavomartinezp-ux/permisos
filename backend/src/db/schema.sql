-- ============================================================
-- CESFAM Los Cerros — Sistema de Gestión de Permisos
-- Schema v1.0 — Motor de Contabilidad de Tiempos
-- ============================================================

CREATE TABLE IF NOT EXISTS servicios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tipos_permisos (
  id               SERIAL PRIMARY KEY,
  codigo           VARCHAR(20) UNIQUE NOT NULL,
  nombre           VARCHAR(100) NOT NULL,
  descripcion      TEXT,
  dias_anuales_max INTEGER NOT NULL,
  requiere_aprobacion BOOLEAN DEFAULT TRUE,
  color            VARCHAR(7) DEFAULT '#3B82F6',
  activo           BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id           SERIAL PRIMARY KEY,
  rut          VARCHAR(12) UNIQUE NOT NULL,
  nombres      VARCHAR(100) NOT NULL,
  apellidos    VARCHAR(100) NOT NULL,
  cargo        VARCHAR(100),
  servicio_id  INTEGER REFERENCES servicios(id),
  fecha_ingreso DATE,
  activo       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id               SERIAL PRIMARY KEY,
  email            VARCHAR(150) UNIQUE NOT NULL,
  password_hash    VARCHAR(255) NOT NULL,
  rol              VARCHAR(20) CHECK (rol IN ('admin', 'supervisor', 'funcionario')) DEFAULT 'funcionario',
  funcionario_id   INTEGER REFERENCES funcionarios(id),
  activo           BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Saldos anuales por funcionario y tipo de permiso
CREATE TABLE IF NOT EXISTS saldos_funcionarios (
  id               SERIAL PRIMARY KEY,
  funcionario_id   INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  tipo_permiso_id  INTEGER NOT NULL REFERENCES tipos_permisos(id),
  anio             INTEGER NOT NULL,
  dias_asignados   INTEGER NOT NULL,
  dias_usados      INTEGER DEFAULT 0,
  dias_pendientes  INTEGER DEFAULT 0,
  updated_at       TIMESTAMP DEFAULT NOW(),
  UNIQUE (funcionario_id, tipo_permiso_id, anio),
  CONSTRAINT dias_usados_valido CHECK (dias_usados >= 0),
  CONSTRAINT dias_pendientes_valido CHECK (dias_pendientes >= 0),
  CONSTRAINT dias_no_exceden CHECK (dias_usados + dias_pendientes <= dias_asignados)
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id               SERIAL PRIMARY KEY,
  funcionario_id   INTEGER NOT NULL REFERENCES funcionarios(id),
  tipo_permiso_id  INTEGER NOT NULL REFERENCES tipos_permisos(id),
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  dias_solicitados INTEGER NOT NULL,
  motivo           TEXT,
  estado           VARCHAR(20) CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')) DEFAULT 'pendiente',
  aprobado_por     INTEGER REFERENCES usuarios(id),
  fecha_solicitud  TIMESTAMP DEFAULT NOW(),
  fecha_resolucion TIMESTAMP,
  observaciones    TEXT,
  CONSTRAINT fecha_valida CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT dias_positivos CHECK (dias_solicitados > 0)
);

-- Tabla principal de auditoría: el corazón del motor de transacciones
CREATE TABLE IF NOT EXISTS historial_movimientos (
  id                   SERIAL PRIMARY KEY,
  funcionario_id       INTEGER NOT NULL REFERENCES funcionarios(id),
  solicitud_id         INTEGER REFERENCES solicitudes(id),
  tipo_permiso_id      INTEGER NOT NULL REFERENCES tipos_permisos(id),
  tipo_movimiento      VARCHAR(20) CHECK (tipo_movimiento IN ('asignacion', 'descuento', 'reintegro', 'ajuste', 'reserva')),
  dias_movimiento      INTEGER NOT NULL,
  saldo_anterior       INTEGER NOT NULL,
  saldo_nuevo          INTEGER NOT NULL,
  descripcion          TEXT,
  usuario_responsable  INTEGER REFERENCES usuarios(id),
  created_at           TIMESTAMP DEFAULT NOW()
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_solicitudes_funcionario ON solicitudes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_fechas ON solicitudes(fecha_inicio, fecha_fin);
CREATE INDEX IF NOT EXISTS idx_historial_funcionario ON historial_movimientos(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON historial_movimientos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saldos_funcionario_anio ON saldos_funcionarios(funcionario_id, anio);
