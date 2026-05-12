-- ============================================================
-- Agregar nuevos tipos de permisos requeridos
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

INSERT INTO tipos_permisos (codigo, nombre, descripcion, dias_anuales_max, color) VALUES
  ('LICENCIA',  'Licencia Médica',     'Licencia médica por enfermedad o accidente', 0,  '#EF4444'),
  ('CAPACIT',   'Días de Capacitación','Días destinados a capacitación y formación',  5,  '#06B6D4')
ON CONFLICT (codigo) DO NOTHING;

-- Crear saldos para todos los funcionarios activos del año 2026
DO $$
DECLARE
  f_id INTEGER;
  t_id INTEGER;
  t_max INTEGER;
BEGIN
  FOR t_id, t_max IN
    SELECT id, dias_anuales_max FROM tipos_permisos
    WHERE codigo IN ('LICENCIA', 'CAPACIT') AND activo = true
  LOOP
    FOR f_id IN SELECT id FROM funcionarios WHERE activo = true LOOP
      INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
      VALUES (f_id, t_id, 2026, t_max)
      ON CONFLICT (funcionario_id, tipo_permiso_id, anio) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Verificar
SELECT codigo, nombre, dias_anuales_max, activo FROM tipos_permisos ORDER BY nombre;
