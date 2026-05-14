-- Migración v4: Módulo de Historial de Suplencias
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS historial_suplencias (
  id                        SERIAL PRIMARY KEY,
  funcionario_suplente_id   INTEGER NOT NULL REFERENCES funcionarios(id),
  funcionario_reemplazado_id INTEGER REFERENCES funcionarios(id),
  rut_reemplazado           VARCHAR(20),
  nombre_reemplazado        VARCHAR(200),
  cargo_reemplazado         VARCHAR(200) NOT NULL,
  unidad                    VARCHAR(200),
  motivo_reemplazo          VARCHAR(50) NOT NULL
    CHECK (motivo_reemplazo IN (
      'licencia_medica','feriado_legal','permiso_administrativo',
      'permiso_sin_goce','vacancia','otro'
    )),
  fecha_inicio              DATE NOT NULL,
  fecha_termino             DATE NOT NULL,
  estado                    VARCHAR(20) NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','finalizada','prorrogada')),
  observaciones             TEXT,
  documento_respaldo        VARCHAR(500),
  creado_por                INTEGER REFERENCES usuarios(id),
  actualizado_por           INTEGER REFERENCES usuarios(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suplencias_prorrogas (
  id                    SERIAL PRIMARY KEY,
  suplencia_id          INTEGER NOT NULL REFERENCES historial_suplencias(id) ON DELETE CASCADE,
  fecha_termino_anterior DATE NOT NULL,
  nueva_fecha_termino   DATE NOT NULL,
  observaciones         TEXT,
  creado_por            INTEGER REFERENCES usuarios(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suplencias_suplente ON historial_suplencias(funcionario_suplente_id);
CREATE INDEX IF NOT EXISTS idx_suplencias_estado   ON historial_suplencias(estado);
CREATE INDEX IF NOT EXISTS idx_suplencias_fechas   ON historial_suplencias(fecha_inicio, fecha_termino);
CREATE INDEX IF NOT EXISTS idx_prorrogas_suplencia ON suplencias_prorrogas(suplencia_id);
