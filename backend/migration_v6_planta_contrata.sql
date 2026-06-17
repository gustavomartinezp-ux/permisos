-- Migración v6: Tipos Planta y Contrata con datos de escalafón
-- Ejecutar en Supabase SQL Editor

-- 1. Nuevas columnas para datos de carrera funcionaria
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS escalafon VARCHAR(100),
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nivel     VARCHAR(50);

-- 2. Actualizar columna grupo_contractual para incluir Planta y Contrata
--    (columna GENERATED ALWAYS: hay que eliminar y recrear)
ALTER TABLE funcionarios DROP COLUMN IF EXISTS grupo_contractual;

ALTER TABLE funcionarios
  ADD COLUMN grupo_contractual VARCHAR(30)
    GENERATED ALWAYS AS (
      CASE tipo_contrato
        WHEN 'Indefinido'  THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Plazo Fijo'  THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Planta'      THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Contrata'    THEN 'FUNCIONARIOS_CONTRATA'
        WHEN 'Honorarios'  THEN 'FUNCIONARIOS_HONORARIOS'
        WHEN 'Suplencia'   THEN 'FUNCIONARIOS_SUPLENCIAS'
        ELSE NULL
      END
    ) STORED;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_funcionarios_tipo_contrato
  ON funcionarios(tipo_contrato) WHERE activo = true;

CREATE INDEX IF NOT EXISTS idx_funcionarios_grupo
  ON funcionarios(grupo_contractual) WHERE activo = true;
