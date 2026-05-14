-- ============================================================
-- MIGRACIÓN v2: Permiso Estamento + Horas Compensatorias
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. Agregar jornada_forzada a tipos_permisos ──────────────────────────────
ALTER TABLE tipos_permisos
  ADD COLUMN IF NOT EXISTS jornada_forzada VARCHAR(5)
    CHECK (jornada_forzada IN ('AM', 'PM'));

-- ── 2. Insertar tipo ESTAMENTO (media jornada PM forzada) ────────────────────
INSERT INTO tipos_permisos
  (codigo, nombre, descripcion, dias_anuales_max, requiere_aprobacion, color,
   es_feriado_legal, activo, permite_medio_dia, jornada_forzada)
VALUES
  ('ESTAMENTO', 'Permiso de Estamento',
   'Permiso parcial de estamento. Rige desde las 13:00 hrs según normativa institucional.',
   6, TRUE, '#0EA5E9',
   FALSE, TRUE, TRUE, 'PM')
ON CONFLICT (codigo) DO UPDATE SET
  permite_medio_dia = TRUE,
  jornada_forzada   = 'PM',
  activo            = TRUE;

-- ── 3. Crear saldo ESTAMENTO para todos los funcionarios activos ─────────────
INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
SELECT f.id, tp.id, EXTRACT(YEAR FROM NOW())::INT, 6
FROM funcionarios f
CROSS JOIN tipos_permisos tp
WHERE tp.codigo = 'ESTAMENTO'
  AND f.activo = TRUE
ON CONFLICT (funcionario_id, tipo_permiso_id, anio) DO NOTHING;

-- ── 4. Crear tabla horas_compensatorias ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS horas_compensatorias (
  id                   SERIAL PRIMARY KEY,
  funcionario_id       INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  fecha_realizacion    DATE    NOT NULL,
  tipo_dia             VARCHAR(10) NOT NULL
    CHECK (tipo_dia IN ('HABIL','SABADO','DOMINGO','FERIADO')),
  horas_realizadas     NUMERIC(6,2) NOT NULL CHECK (horas_realizadas > 0),
  factor_aplicado      NUMERIC(4,2) NOT NULL,
  horas_compensatorias NUMERIC(6,2) NOT NULL,
  estado               VARCHAR(15) NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','anulado')),
  observaciones        TEXT,
  creado_por           INTEGER REFERENCES usuarios(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. Crear tabla solicitudes_compensacion ──────────────────────────────────
CREATE TABLE IF NOT EXISTS solicitudes_compensacion (
  id                SERIAL PRIMARY KEY,
  funcionario_id    INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
  fecha_inicio      DATE    NOT NULL,
  fecha_fin         DATE    NOT NULL,
  horas_solicitadas NUMERIC(6,2) NOT NULL CHECK (horas_solicitadas > 0),
  estado            VARCHAR(15) NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aprobado','rechazado','cancelado')),
  motivo            TEXT,
  observaciones     TEXT,
  aprobado_por      INTEGER REFERENCES usuarios(id),
  fecha_solicitud   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_resolucion  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. Índices de rendimiento ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_horas_comp_funcionario ON horas_compensatorias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_horas_comp_estado      ON horas_compensatorias(estado);
CREATE INDEX IF NOT EXISTS idx_sol_comp_funcionario   ON solicitudes_compensacion(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_sol_comp_estado        ON solicitudes_compensacion(estado);
