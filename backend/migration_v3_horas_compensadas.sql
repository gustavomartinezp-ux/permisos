-- ============================================================
-- MIGRACIÓN v3: Solicitud de horas compensadas
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar saldo_anterior y saldo_restante a solicitudes_compensacion
ALTER TABLE solicitudes_compensacion
  ADD COLUMN IF NOT EXISTS saldo_anterior  NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS saldo_restante  NUMERIC(8,2);

-- 2. Tabla de trazabilidad FIFO
CREATE TABLE IF NOT EXISTS horas_compensatorias_consumo (
  id                SERIAL PRIMARY KEY,
  solicitud_id      INTEGER NOT NULL REFERENCES solicitudes_compensacion(id) ON DELETE CASCADE,
  horas_comp_id     INTEGER NOT NULL REFERENCES horas_compensatorias(id),
  horas_consumidas  NUMERIC(6,2) NOT NULL CHECK (horas_consumidas > 0),
  fecha_realizacion DATE        NOT NULL,
  tipo_dia          VARCHAR(10),
  factor_aplicado   NUMERIC(4,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horas_consumo_solicitud  ON horas_compensatorias_consumo(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_horas_consumo_horas_comp ON horas_compensatorias_consumo(horas_comp_id);
