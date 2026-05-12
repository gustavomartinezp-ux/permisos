-- ============================================================
-- Feriado Legal: arrastre, bloque 10 días, distribución
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- 1. Marcar tipos que son feriado legal
ALTER TABLE tipos_permisos
  ADD COLUMN IF NOT EXISTS es_feriado_legal BOOLEAN DEFAULT FALSE;

UPDATE tipos_permisos
  SET es_feriado_legal = TRUE
  WHERE LOWER(nombre) LIKE '%feriado%' OR LOWER(codigo) LIKE '%fl%' OR LOWER(codigo) LIKE '%feriado%';

-- 2. Columnas de arrastre y bloque en saldos
ALTER TABLE saldos_funcionarios
  ADD COLUMN IF NOT EXISTS saldo_arrastre       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrastre_usados      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrastre_pendientes  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bloque_10_dias_cumplido BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_inicio_bloque  DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin_bloque     DATE;

-- 3. Columnas de distribución en solicitudes
ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS dias_arrastre       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_periodo_actual INTEGER DEFAULT 0;

-- Retrocompatibilidad: solicitudes existentes = todos días del período actual
UPDATE solicitudes
  SET dias_arrastre = 0,
      dias_periodo_actual = dias_solicitados
  WHERE dias_periodo_actual = 0 AND dias_arrastre = 0;

-- 4. Verificación
SELECT 'tipos_permisos' AS tabla, column_name FROM information_schema.columns
  WHERE table_name = 'tipos_permisos' AND column_name = 'es_feriado_legal'
UNION ALL
SELECT 'saldos_funcionarios', column_name FROM information_schema.columns
  WHERE table_name = 'saldos_funcionarios' AND column_name IN ('saldo_arrastre','arrastre_usados','bloque_10_dias_cumplido')
UNION ALL
SELECT 'solicitudes', column_name FROM information_schema.columns
  WHERE table_name = 'solicitudes' AND column_name IN ('dias_arrastre','dias_periodo_actual')
ORDER BY 1, 2;
