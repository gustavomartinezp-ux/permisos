const { pool } = require('./index');

const migrations = [
  {
    id: 'add_foto_url_to_funcionarios',
    sql: `ALTER TABLE funcionarios ADD COLUMN IF NOT EXISTS foto_url TEXT`,
  },
  {
    // RBAC v2: roles y permisos granulares, adicional a usuarios.rol (que se mantiene
    // por compatibilidad — ver middleware/rbac.js). No modifica ni borra nada existente.
    id: 'rbac_v2_crear_esquema',
    sql: `
      CREATE TABLE IF NOT EXISTS roles (
        id          SERIAL PRIMARY KEY,
        codigo      VARCHAR(30) UNIQUE NOT NULL,
        nombre      VARCHAR(80) NOT NULL,
        descripcion TEXT
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id          SERIAL PRIMARY KEY,
        codigo      VARCHAR(60) UNIQUE NOT NULL,
        descripcion TEXT
      );

      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id)
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        role_id     INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        asignado_por INTEGER REFERENCES usuarios(id),
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (usuario_id, role_id)
      );

      CREATE TABLE IF NOT EXISTS subrogaciones (
        id                     SERIAL PRIMARY KEY,
        supervisor_titular_id  INTEGER NOT NULL REFERENCES usuarios(id),
        usuario_subrogante_id  INTEGER NOT NULL REFERENCES usuarios(id),
        fecha_inicio           DATE NOT NULL,
        fecha_fin              DATE NOT NULL,
        motivo                 TEXT,
        activo                 BOOLEAN NOT NULL DEFAULT TRUE,
        creado_por             INTEGER REFERENCES usuarios(id),
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT subrogacion_fecha_valida CHECK (fecha_fin >= fecha_inicio),
        CONSTRAINT subrogacion_no_auto_delegacion CHECK (supervisor_titular_id <> usuario_subrogante_id)
      );

      CREATE INDEX IF NOT EXISTS idx_subrogaciones_subrogante
        ON subrogaciones(usuario_subrogante_id, fecha_inicio, fecha_fin);
      CREATE INDEX IF NOT EXISTS idx_subrogaciones_titular
        ON subrogaciones(supervisor_titular_id, fecha_inicio, fecha_fin);
      CREATE INDEX IF NOT EXISTS idx_user_roles_usuario ON user_roles(usuario_id);
    `,
  },
  {
    id: 'rbac_v2_seed_roles_permisos',
    sql: `
      INSERT INTO roles (codigo, nombre, descripcion) VALUES
        ('ADMIN_TI',    'Administrador de TI',            'Control técnico global, gestión de usuarios/roles y parámetros del sistema. Único rol que puede eliminar funcionarios.'),
        ('RRHH_ADMIN',  'Encargado de RRHH / Personal',    'Gestión operativa de funcionarios, aprobación final de permisos, ajuste manual de saldos y reportes globales.'),
        ('SECRETARY',   'Secretaría',                      'Soporte operativo: ingreso de solicitudes a nombre de terceros, edición básica de datos y reportes operativos.'),
        ('SUPERVISOR',  'Supervisor (Titular/Subrogante)', 'Visibilidad y pre-aprobación restringida a su equipo/departamento.'),
        ('EMPLOYEE',    'Funcionario',                     'Autoservicio: consulta de saldos propios y solicitudes propias.'),
        ('AUDITOR',     'Auditor / Control Interno',       'Acceso de solo lectura a historial, saldos, logs de auditoría y reportes consolidados.')
      ON CONFLICT (codigo) DO NOTHING;

      INSERT INTO permissions (codigo, descripcion) VALUES
        ('funcionarios.crear',          'Crear funcionarios (incluye carga masiva)'),
        ('funcionarios.editar',         'Editar cualquier dato de un funcionario y reasignar departamento'),
        ('funcionarios.editar_basico',  'Editar únicamente datos básicos de contacto de un funcionario'),
        ('funcionarios.eliminar',       'Eliminar (soft/hard delete) un funcionario'),
        ('solicitudes.crear_terceros',  'Ingresar solicitudes de permiso a nombre de otro funcionario'),
        ('solicitudes.pre_aprobar',     'Pre-aprobar solicitudes del propio equipo/sector'),
        ('solicitudes.aprobar',         'Aprobación final de solicitudes de permiso'),
        ('solicitudes.reintegrar',      'Revertir una solicitud aprobada y reintegrar el saldo'),
        ('saldos.ajustar',              'Ajuste manual de saldos anuales por decreto/resolución'),
        ('reportes.ver_globales',       'Ver y exportar reportes y estadísticas globales'),
        ('reportes.ver_operativos',     'Ver y exportar reportes operativos (no globales)'),
        ('configuracion.gestionar',     'Gestionar parámetros técnicos del sistema'),
        ('usuarios.gestionar_roles',    'Asignar o revocar roles a usuarios'),
        ('auditoria.ver_todo',          'Acceso de solo lectura a todo el historial y saldos del sistema')
      ON CONFLICT (codigo) DO NOTHING;

      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r JOIN permissions p ON
        (r.codigo = 'ADMIN_TI'   AND p.codigo IN ('funcionarios.eliminar','configuracion.gestionar','usuarios.gestionar_roles'))
        OR (r.codigo = 'RRHH_ADMIN' AND p.codigo IN ('funcionarios.crear','funcionarios.editar','funcionarios.editar_basico','solicitudes.aprobar','solicitudes.reintegrar','saldos.ajustar','reportes.ver_globales','reportes.ver_operativos'))
        OR (r.codigo = 'SECRETARY'  AND p.codigo IN ('solicitudes.crear_terceros','funcionarios.editar_basico','reportes.ver_operativos'))
        OR (r.codigo = 'SUPERVISOR' AND p.codigo IN ('solicitudes.pre_aprobar'))
        OR (r.codigo = 'AUDITOR'    AND p.codigo IN ('auditoria.ver_todo','reportes.ver_globales'))
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Backfill: preserva 100% de las capacidades actuales. usuarios.rol NO se modifica.
    id: 'rbac_v2_backfill_usuarios',
    sql: `
      INSERT INTO user_roles (usuario_id, role_id)
      SELECT u.id, r.id FROM usuarios u JOIN roles r ON
        (u.rol = 'admin'      AND r.codigo IN ('ADMIN_TI','RRHH_ADMIN'))
        OR (u.rol = 'supervisor' AND r.codigo = 'SUPERVISOR')
        OR (u.rol = 'funcionario' AND r.codigo = 'EMPLOYEE')
      ON CONFLICT DO NOTHING;
    `,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id VARCHAR(100) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT id FROM _migrations WHERE id = $1',
        [migration.id]
      );
      if (rows.length > 0) continue;

      await client.query(migration.sql);
      await client.query('INSERT INTO _migrations (id) VALUES ($1)', [migration.id]);
      console.log(`[migrate] ✓ ${migration.id}`);
    }
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { runMigrations };
