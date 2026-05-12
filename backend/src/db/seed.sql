-- ============================================================
-- Datos iniciales — CESFAM Los Cerros
-- ============================================================

INSERT INTO servicios (nombre, descripcion) VALUES
  ('Medicina General',    'Atención médica primaria y control de enfermedades crónicas'),
  ('Enfermería',          'Curaciones, vacunas y programas de salud'),
  ('Odontología',         'Salud bucal y atención dental'),
  ('Kinesiología',        'Rehabilitación y fisioterapia'),
  ('Salud Mental',        'Apoyo psicológico y psiquiátrico'),
  ('Farmacia',            'Dispensación de medicamentos'),
  ('Administración',      'Gestión y apoyo administrativo')
ON CONFLICT DO NOTHING;

INSERT INTO tipos_permisos (codigo, nombre, descripcion, dias_anuales_max, color) VALUES
  ('FERIADO',  'Feriado Legal',           'Feriado anual remunerado según Código del Trabajo', 15, '#3B82F6'),
  ('ADMIN',    'Permiso Administrativo',  'Hasta 6 días hábiles por año para trámites personales', 6, '#8B5CF6'),
  ('MATRIM',   'Permiso por Matrimonio',  '5 días hábiles por contracción de matrimonio civil o religioso', 5, '#EC4899'),
  ('FALLEC',   'Permiso por Fallecimiento', '3-7 días hábiles según parentesco', 7, '#6B7280'),
  ('COMPENS',  'Días Compensatorios',     'Días compensatorios por trabajo en días festivos', 10, '#F59E0B')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO funcionarios (rut, nombres, apellidos, cargo, servicio_id, fecha_ingreso) VALUES
  ('12.345.678-9', 'María',    'González Pinto',    'Médico General',          1, '2018-03-15'),
  ('13.456.789-0', 'Juan',     'Pérez Soto',        'Enfermero/a Jefe',        2, '2015-06-01'),
  ('14.567.890-1', 'Claudia',  'Ramírez Torres',    'Odontóloga',              3, '2020-01-10'),
  ('15.678.901-2', 'Roberto',  'Silva Muñoz',       'Kinesiólogo',             4, '2019-08-20'),
  ('16.789.012-3', 'Alejandra','Morales Vega',      'Psicóloga',               5, '2017-04-05'),
  ('17.890.123-4', 'Carlos',   'Fuentes Díaz',      'Químico Farmacéutico',    6, '2021-02-28'),
  ('18.901.234-5', 'Patricia', 'Herrera Lagos',     'Técnico Enfermería',      2, '2016-09-12'),
  ('19.012.345-6', 'Daniela',  'Castro Rojas',      'Secretaria Médica',       7, '2022-05-03')
ON CONFLICT (rut) DO NOTHING;

-- Usuarios: contraseñas en bcrypt — contraseña de prueba: "password"
INSERT INTO usuarios (email, password_hash, rol, funcionario_id) VALUES
  ('admin@cesfam.cl',
   '$2a$10$SjGaMhIHs.1aP32R3FnuT.Wh50bHQp5WUVdSJttvU4Ue0qIK3Ax2e',
   'admin', NULL),
  ('supervisor@cesfam.cl',
   '$2a$10$SjGaMhIHs.1aP32R3FnuT.Wh50bHQp5WUVdSJttvU4Ue0qIK3Ax2e',
   'supervisor', 1),
  ('maria.gonzalez@cesfam.cl',
   '$2a$10$SjGaMhIHs.1aP32R3FnuT.Wh50bHQp5WUVdSJttvU4Ue0qIK3Ax2e',
   'funcionario', 1),
  ('juan.perez@cesfam.cl',
   '$2a$10$SjGaMhIHs.1aP32R3FnuT.Wh50bHQp5WUVdSJttvU4Ue0qIK3Ax2e',
   'funcionario', 2),
  ('claudia.ramirez@cesfam.cl',
   '$2a$10$SjGaMhIHs.1aP32R3FnuT.Wh50bHQp5WUVdSJttvU4Ue0qIK3Ax2e',
   'funcionario', 3)
ON CONFLICT (email) DO NOTHING;

-- Saldos 2026 para todos los funcionarios
DO $$
DECLARE
  f_id INTEGER;
  t_id INTEGER;
  t_max INTEGER;
BEGIN
  FOR f_id IN SELECT id FROM funcionarios WHERE activo = true LOOP
    FOR t_id, t_max IN SELECT id, dias_anuales_max FROM tipos_permisos WHERE activo = true LOOP
      INSERT INTO saldos_funcionarios (funcionario_id, tipo_permiso_id, anio, dias_asignados)
      VALUES (f_id, t_id, 2026, t_max)
      ON CONFLICT (funcionario_id, tipo_permiso_id, anio) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- Solicitudes y movimientos de ejemplo para el año 2026
DO $$
DECLARE
  admin_user_id INTEGER;
  func1_id INTEGER;
  func2_id INTEGER;
  func3_id INTEGER;
  tipo_feriado_id INTEGER;
  tipo_admin_id INTEGER;
  saldo_id INTEGER;
  sol_id INTEGER;
BEGIN
  SELECT id INTO admin_user_id FROM usuarios WHERE email = 'admin@cesfam.cl';
  SELECT id INTO func1_id FROM funcionarios WHERE rut = '12.345.678-9';
  SELECT id INTO func2_id FROM funcionarios WHERE rut = '13.456.789-0';
  SELECT id INTO func3_id FROM funcionarios WHERE rut = '14.567.890-1';
  SELECT id INTO tipo_feriado_id FROM tipos_permisos WHERE codigo = 'FERIADO';
  SELECT id INTO tipo_admin_id FROM tipos_permisos WHERE codigo = 'ADMIN';

  -- Permiso aprobado para func1 (3 días de feriado en enero)
  SELECT id INTO saldo_id FROM saldos_funcionarios
    WHERE funcionario_id = func1_id AND tipo_permiso_id = tipo_feriado_id AND anio = 2026;

  INSERT INTO solicitudes (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
    dias_solicitados, motivo, estado, aprobado_por, fecha_solicitud, fecha_resolucion)
  VALUES (func1_id, tipo_feriado_id, '2026-01-20', '2026-01-22',
    3, 'Vacaciones de verano', 'aprobado', admin_user_id,
    '2026-01-10 09:00:00', '2026-01-11 10:30:00')
  RETURNING id INTO sol_id;

  UPDATE saldos_funcionarios SET dias_usados = 3 WHERE id = saldo_id;

  INSERT INTO historial_movimientos
    (funcionario_id, solicitud_id, tipo_permiso_id, tipo_movimiento,
     dias_movimiento, saldo_anterior, saldo_nuevo, descripcion, usuario_responsable, created_at)
  VALUES (func1_id, sol_id, tipo_feriado_id, 'descuento',
    3, 15, 12, 'Permiso aprobado: Feriado Legal del 2026-01-20 al 2026-01-22',
    admin_user_id, '2026-01-11 10:30:00');

  -- Permiso pendiente para func2 (2 días administrativos)
  SELECT id INTO saldo_id FROM saldos_funcionarios
    WHERE funcionario_id = func2_id AND tipo_permiso_id = tipo_admin_id AND anio = 2026;

  INSERT INTO solicitudes (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
    dias_solicitados, motivo, estado, fecha_solicitud)
  VALUES (func2_id, tipo_admin_id, '2026-05-14', '2026-05-15',
    2, 'Trámites bancarios y legales', 'pendiente', '2026-05-09 08:45:00')
  RETURNING id INTO sol_id;

  UPDATE saldos_funcionarios SET dias_pendientes = 2 WHERE id = saldo_id;

  INSERT INTO historial_movimientos
    (funcionario_id, solicitud_id, tipo_permiso_id, tipo_movimiento,
     dias_movimiento, saldo_anterior, saldo_nuevo, descripcion, usuario_responsable, created_at)
  VALUES (func2_id, sol_id, tipo_admin_id, 'reserva',
    2, 6, 4, 'Solicitud de permiso registrada - 2 día(s) en trámite',
    admin_user_id, '2026-05-09 08:45:00');

  -- Permiso rechazado para func3 (5 días feriado)
  SELECT id INTO saldo_id FROM saldos_funcionarios
    WHERE funcionario_id = func3_id AND tipo_permiso_id = tipo_feriado_id AND anio = 2026;

  INSERT INTO solicitudes (funcionario_id, tipo_permiso_id, fecha_inicio, fecha_fin,
    dias_solicitados, motivo, estado, aprobado_por, fecha_solicitud, fecha_resolucion,
    observaciones)
  VALUES (func3_id, tipo_feriado_id, '2026-03-10', '2026-03-14',
    5, 'Viaje familiar', 'rechazado', admin_user_id,
    '2026-03-01 14:00:00', '2026-03-02 09:00:00',
    'Período de alta demanda. Reagendar para el mes siguiente.')
  RETURNING id INTO sol_id;

  INSERT INTO historial_movimientos
    (funcionario_id, solicitud_id, tipo_permiso_id, tipo_movimiento,
     dias_movimiento, saldo_anterior, saldo_nuevo, descripcion, usuario_responsable, created_at)
  VALUES (func3_id, sol_id, tipo_feriado_id, 'reintegro',
    5, 10, 15, 'Solicitud rechazada — 5 día(s) reintegrados al saldo',
    admin_user_id, '2026-03-02 09:00:00');

END $$;
