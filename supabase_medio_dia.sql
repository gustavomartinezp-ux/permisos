-- ============================================================
-- Migración: medios días + reintegro + días por estamento
-- Ejecutar en Supabase > SQL Editor
-- ============================================================

-- 1. Cambiar columnas a NUMERIC para soportar 0.5 días
ALTER TABLE solicitudes
  ALTER COLUMN dias_solicitados   TYPE NUMERIC(6,1),
  ALTER COLUMN dias_arrastre      TYPE NUMERIC(6,1),
  ALTER COLUMN dias_periodo_actual TYPE NUMERIC(6,1);

ALTER TABLE saldos_funcionarios
  ALTER COLUMN dias_asignados       TYPE NUMERIC(6,1),
  ALTER COLUMN dias_usados          TYPE NUMERIC(6,1),
  ALTER COLUMN dias_pendientes      TYPE NUMERIC(6,1),
  ALTER COLUMN saldo_arrastre       TYPE NUMERIC(6,1),
  ALTER COLUMN arrastre_usados      TYPE NUMERIC(6,1),
  ALTER COLUMN arrastre_pendientes  TYPE NUMERIC(6,1);

ALTER TABLE historial_movimientos
  ALTER COLUMN dias_movimiento TYPE NUMERIC(6,1),
  ALTER COLUMN saldo_anterior  TYPE NUMERIC(6,1),
  ALTER COLUMN saldo_nuevo     TYPE NUMERIC(6,1);

-- 2. Agregar flag de medio día a tipos de permisos
ALTER TABLE tipos_permisos
  ADD COLUMN IF NOT EXISTS permite_medio_dia BOOLEAN DEFAULT false;

-- 3. Habilitar medio día para Permiso Administrativo
UPDATE tipos_permisos SET permite_medio_dia = true WHERE codigo = 'ADMIN';

-- 4. Agregar estado 'cancelado' (reintegro por admin)
-- No requiere cambio de schema si no hay CHECK constraint en estado
-- Verificar que no exista constraint:
ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
