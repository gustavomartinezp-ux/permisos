-- ============================================================
-- Migración: nuevos campos personales en funcionarios
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
  ADD COLUMN IF NOT EXISTS telefono        VARCHAR(20),
  ADD COLUMN IF NOT EXISTS direccion_particular TEXT,
  ADD COLUMN IF NOT EXISTS numero_reloj    INTEGER;
