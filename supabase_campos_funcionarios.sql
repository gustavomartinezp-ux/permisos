-- ============================================================
-- Nuevos campos para funcionarios
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Tabla de dispositivos/establecimientos
CREATE TABLE IF NOT EXISTS dispositivos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT TRUE
);

INSERT INTO dispositivos (nombre) VALUES
  ('CESFAM LOS CERROS'),
  ('SARE LOS CERROS'),
  ('CECOSF VILLA CENTINELA'),
  ('CECOSF LOS LOBOS')
ON CONFLICT DO NOTHING;

-- Nuevas columnas en funcionarios
ALTER TABLE funcionarios
  ADD COLUMN IF NOT EXISTS tipo_contrato  VARCHAR(20)
    CHECK (tipo_contrato IN ('Indefinido','Plazo Fijo','Honorarios','Suplencia')),
  ADD COLUMN IF NOT EXISTS horas_contrato INTEGER,
  ADD COLUMN IF NOT EXISTS dispositivo_id INTEGER REFERENCES dispositivos(id),
  ADD COLUMN IF NOT EXISTS reemplaza_a    INTEGER REFERENCES funcionarios(id);

-- Verificación
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'funcionarios' ORDER BY ordinal_position;
