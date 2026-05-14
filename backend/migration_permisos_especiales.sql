-- ============================================================
-- MIGRACIÓN: Módulo de Permisos Especiales
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Ampliar columna codigo (era VARCHAR(20), los códigos especiales tienen >20 chars)
ALTER TABLE tipos_permisos
  ALTER COLUMN codigo TYPE VARCHAR(60);

-- 2. Nuevas columnas en tipos_permisos
ALTER TABLE tipos_permisos
  ADD COLUMN IF NOT EXISTS es_especial          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_especial        VARCHAR(60),
  ADD COLUMN IF NOT EXISTS dias_fijos           INTEGER,
  ADD COLUMN IF NOT EXISTS tipo_dias            VARCHAR(20)
    CHECK (tipo_dias IN ('corridos', 'habiles', 'habiles_continuos')),
  ADD COLUMN IF NOT EXISTS normativa            VARCHAR(120),
  ADD COLUMN IF NOT EXISTS requiere_certificado BOOLEAN     NOT NULL DEFAULT FALSE;

-- 2. Insertar los 6 tipos especiales (ON CONFLICT para idempotencia)
INSERT INTO tipos_permisos
  (codigo, nombre, descripcion,
   dias_anuales_max, requiere_aprobacion, color,
   es_feriado_legal, es_especial, tipo_especial,
   dias_fijos, tipo_dias, normativa, requiere_certificado, activo)
VALUES
  ('ESP_FALLECIMIENTO_HIJO',
   'Fallecimiento de Hijo',
   'Permiso especial por fallecimiento de hijo(a)',
   10, TRUE, '#7C3AED',
   FALSE, TRUE, 'ESP_FALLECIMIENTO_HIJO',
   10, 'corridos', 'Art. 108 bis Ley 18.883', TRUE, TRUE),

  ('ESP_HIJO_GESTACION',
   'Fallecimiento Hijo en Gestación',
   'Permiso especial por fallecimiento de hijo en gestación (certificado médico requerido)',
   7, TRUE, '#9333EA',
   FALSE, TRUE, 'ESP_HIJO_GESTACION',
   7, 'habiles', 'Art. 108 bis Ley 18.883', TRUE, TRUE),

  ('ESP_CONYUGE',
   'Fallecimiento Cónyuge o Conviviente Civil',
   'Permiso especial por fallecimiento de cónyuge o conviviente civil',
   7, TRUE, '#DC2626',
   FALSE, TRUE, 'ESP_CONYUGE',
   7, 'corridos', 'Art. 108 bis Ley 18.883', TRUE, TRUE),

  ('ESP_FAMILIAR_DIRECTO',
   'Fallecimiento Padre, Madre o Hermano',
   'Permiso especial por fallecimiento de padre, madre o hermano(a)',
   4, TRUE, '#EA580C',
   FALSE, TRUE, 'ESP_FAMILIAR_DIRECTO',
   4, 'habiles', 'Art. 108 Ley 18.883', TRUE, TRUE),

  ('ESP_NACIMIENTO',
   'Nacimiento o Adopción de Hijo',
   'Permiso especial por nacimiento o adopción de hijo(a)',
   5, TRUE, '#0891B2',
   FALSE, TRUE, 'ESP_NACIMIENTO',
   5, 'habiles', 'Art. 195 Código del Trabajo', FALSE, TRUE),

  ('ESP_MATRIMONIO',
   'Casamiento o Unión Civil',
   'Permiso especial por matrimonio o acuerdo de unión civil',
   5, TRUE, '#059669',
   FALSE, TRUE, 'ESP_MATRIMONIO',
   5, 'habiles_continuos', 'Art. 207 bis Código del Trabajo', FALSE, TRUE)

ON CONFLICT (codigo) DO UPDATE SET
  nombre                = EXCLUDED.nombre,
  descripcion           = EXCLUDED.descripcion,
  es_especial           = EXCLUDED.es_especial,
  tipo_especial         = EXCLUDED.tipo_especial,
  dias_fijos            = EXCLUDED.dias_fijos,
  tipo_dias             = EXCLUDED.tipo_dias,
  normativa             = EXCLUDED.normativa,
  requiere_certificado  = EXCLUDED.requiere_certificado,
  color                 = EXCLUDED.color,
  activo                = EXCLUDED.activo;
