-- ============================================================
-- Migración: jornada AM/PM para medios días
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

ALTER TABLE solicitudes
  ADD COLUMN IF NOT EXISTS jornada_medio_dia VARCHAR(2) CHECK (jornada_medio_dia IN ('AM', 'PM'));
