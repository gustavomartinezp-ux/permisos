-- Migración v5: Separación estructural por grupo contractual
-- Ejecutar en Supabase SQL Editor

-- Columna calculada automáticamente según tipo_contrato
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS grupo_contractual VARCHAR(30)
    GENERATED ALWAYS AS (
      CASE tipo_contrato
        WHEN 'Indefinido' THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Plazo Fijo'  THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Honorarios'  THEN 'FUNCIONARIOS_HONORARIOS'
        WHEN 'Suplencia'   THEN 'FUNCIONARIOS_SUPLENCIAS'
        ELSE NULL
      END
    ) STORED;

-- Campos específicos para funcionarios honorarios
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS convenio_honorarios  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS prestacion           VARCHAR(200),
  ADD COLUMN IF NOT EXISTS fecha_termino_contrato DATE;

-- Índices para consultas rápidas por grupo
CREATE INDEX IF NOT EXISTS idx_funcionarios_tipo_contrato
  ON funcionarios(tipo_contrato) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_funcionarios_grupo
  ON funcionarios(grupo_contractual) WHERE activo = true;
