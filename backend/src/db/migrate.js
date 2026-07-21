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
  {
    // Módulo de reportería asíncrona: seguimiento de tareas de generación de
    // PDF/Excel ejecutivos procesadas en segundo plano (worker in-process,
    // sin Redis/cola externa — ver backend/src/workers/reporteWorker.js).
    // El archivo generado se guarda directamente en la fila (BYTEA); dado el
    // volumen de este sistema (~230 funcionarios) es más simple y robusto que
    // depender de almacenamiento en disco efímero de Render.
    id: 'report_tasks_v1',
    sql: `
      CREATE TABLE IF NOT EXISTS report_tasks (
        id             SERIAL PRIMARY KEY,
        usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        report_type    VARCHAR(50) NOT NULL,
        formato        VARCHAR(10) NOT NULL CHECK (formato IN ('pdf','excel')),
        status         VARCHAR(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
        filtros        JSONB NOT NULL DEFAULT '{}',
        archivo        BYTEA,
        archivo_nombre VARCHAR(200),
        error_message  TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at   TIMESTAMPTZ,
        expires_at     TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_report_tasks_usuario ON report_tasks(usuario_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_report_tasks_expires ON report_tasks(expires_at);
    `,
  },
  {
    // Gestión de credenciales institucionales: permite a ADMIN_TI/RRHH_ADMIN/SECRETARY
    // registrar el email de un funcionario y asignarle una contraseña por defecto
    // (derivada de su RUT) con obligación de cambio en el primer login.
    id: 'credenciales_v1',
    sql: `
      ALTER TABLE usuarios
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

      CREATE TABLE IF NOT EXISTS auditoria_credenciales (
        id                     SERIAL PRIMARY KEY,
        target_funcionario_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        target_usuario_id      INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        accion                 VARCHAR(30) NOT NULL CHECK (accion IN ('UPDATE_EMAIL', 'RESET_DEFAULT_PASSWORD')),
        actualizado_por        INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        detalle                JSONB,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_auditoria_credenciales_funcionario
        ON auditoria_credenciales(target_funcionario_id, created_at DESC);

      INSERT INTO permissions (codigo, descripcion) VALUES
        ('funcionarios.gestionar_credenciales', 'Registrar/actualizar email institucional y asignar contraseña por defecto de un funcionario')
      ON CONFLICT (codigo) DO NOTHING;

      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r JOIN permissions p ON
        p.codigo = 'funcionarios.gestionar_credenciales'
        AND r.codigo IN ('ADMIN_TI', 'RRHH_ADMIN', 'SECRETARY')
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Módulo social de cumpleaños: mensaje institucional + likes. Los
    // cumpleañeros del día se calculan en vivo desde funcionarios.fecha_nacimiento
    // (sin tabla/cron aparte, ver backend/src/routes/birthdays.js). El "like"
    // referencia funcionarios (no usuarios) para el cumpleañero porque no todo
    // funcionario tiene cuenta de login, y referencia usuarios para quien
    // reacciona (siempre autenticado). `dia` permite volver a felicitar cada
    // año sin chocar con el Unique constraint.
    id: 'cumpleanos_v1',
    sql: `
      ALTER TABLE funcionarios
        ADD COLUMN IF NOT EXISTS mostrar_cumpleanos BOOLEAN NOT NULL DEFAULT TRUE;

      CREATE TABLE IF NOT EXISTS birthday_likes (
        id                       SERIAL PRIMARY KEY,
        birthday_funcionario_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        liker_usuario_id         INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        dia                      DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (birthday_funcionario_id, liker_usuario_id, dia)
      );

      CREATE INDEX IF NOT EXISTS idx_birthday_likes_funcionario_dia
        ON birthday_likes(birthday_funcionario_id, dia);
    `,
  },
  {
    // RRHH_ADMIN y SECRETARY pasan a tener todos los permisos operativos/de
    // personal (funcionarios, solicitudes, saldos, reportes, auditoría de
    // solo lectura) — deliberadamente SIN funcionarios.eliminar (sigue
    // exclusivo de ADMIN_TI) ni usuarios.gestionar_roles/configuracion.gestionar
    // (funciones de administración técnica del sistema, no de personal).
    id: 'permisos_v2_rrhh_secretaria_amplios',
    sql: `
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r JOIN permissions p ON
        r.codigo IN ('RRHH_ADMIN', 'SECRETARY')
        AND p.codigo IN (
          'funcionarios.crear', 'funcionarios.editar', 'funcionarios.editar_basico',
          'funcionarios.gestionar_credenciales',
          'solicitudes.crear_terceros', 'solicitudes.pre_aprobar', 'solicitudes.aprobar', 'solicitudes.reintegrar',
          'saldos.ajustar',
          'reportes.ver_globales', 'reportes.ver_operativos',
          'auditoria.ver_todo'
        )
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Bono de antigüedad en feriado legal: +5 días al cumplir 15 y 20 años de
    // servicio (fecha_ingreso). Un solo registro por funcionario+tramo evita
    // aplicar el bono más de una vez, y sirve a la vez como la alerta (se crea
    // apenas se entra en la ventana de anticipación, antes de aplicarse).
    id: 'hitos_antiguedad_v1',
    sql: `
      CREATE TABLE IF NOT EXISTS hitos_antiguedad (
        id                   SERIAL PRIMARY KEY,
        funcionario_id       INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        tramo_anios          INTEGER NOT NULL CHECK (tramo_anios IN (15, 20)),
        fecha_cumplimiento   DATE NOT NULL,
        dias_agregados       INTEGER NOT NULL DEFAULT 5,
        aplicado             BOOLEAN NOT NULL DEFAULT FALSE,
        aplicado_en          TIMESTAMPTZ,
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (funcionario_id, tramo_anios)
      );

      CREATE INDEX IF NOT EXISTS idx_hitos_antiguedad_funcionario
        ON hitos_antiguedad(funcionario_id);
      CREATE INDEX IF NOT EXISTS idx_hitos_antiguedad_pendientes
        ON hitos_antiguedad(fecha_cumplimiento) WHERE aplicado = FALSE;
    `,
  },
  {
    // Licencias Médicas: entidad separada de tipos_permisos/solicitudes (no
    // debe aparecer como "tipo de permiso" en los menús regulares). El tipo
    // 'LICENCIA' existente se desactiva (no se borra: 0 solicitudes reales lo
    // usaban nunca, solo saldos en 0 y unos pocos ajustes de prueba del propio
    // usuario — se deja la fila por si alguna vez hace falta revisar historial,
    // pero deja de aparecer en cualquier flujo de permisos regulares).
    id: 'licencias_medicas_v1',
    sql: `
      UPDATE tipos_permisos SET activo = FALSE WHERE codigo = 'LICENCIA';

      CREATE TABLE IF NOT EXISTS licencias_medicas (
        id              SERIAL PRIMARY KEY,
        funcionario_id  INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        fecha_inicio    DATE NOT NULL,
        fecha_fin       DATE NOT NULL,
        dias            INTEGER NOT NULL,
        folio           VARCHAR(50),
        entidad_emisora VARCHAR(100),
        observaciones   TEXT,
        registrado_por  INTEGER REFERENCES usuarios(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT licencia_fecha_valida CHECK (fecha_fin >= fecha_inicio),
        CONSTRAINT licencia_dias_positivos CHECK (dias > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_licencias_medicas_funcionario
        ON licencias_medicas(funcionario_id, fecha_inicio DESC);

      INSERT INTO permissions (codigo, descripcion) VALUES
        ('licencias_medicas.gestionar', 'Registrar, editar y eliminar licencias médicas de funcionarios')
      ON CONFLICT (codigo) DO NOTHING;

      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM roles r JOIN permissions p ON
        p.codigo = 'licencias_medicas.gestionar'
        AND r.codigo IN ('RRHH_ADMIN', 'SECRETARY')
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    // Cometidos Funcionarios y Comisiones de Servicio (Ley 19.378 / 18.883):
    // una sola tabla con discriminador `tipo`, mismo criterio que
    // tipos_permisos/solicitudes en este proyecto (una entidad, variantes por
    // columna/flag, en vez de tablas paralelas casi idénticas). Reutiliza los
    // permisos ya existentes de aprobación de solicitudes (mismo concepto de
    // autoridad: jefatura pre-aprueba, dirección aprueba en definitiva).
    id: 'cometidos_comisiones_v1',
    sql: `
      CREATE TABLE IF NOT EXISTS cometidos_comisiones (
        id                      SERIAL PRIMARY KEY,
        tipo                    VARCHAR(10) NOT NULL CHECK (tipo IN ('cometido', 'comision')),
        funcionario_id          INTEGER NOT NULL REFERENCES funcionarios(id) ON DELETE CASCADE,
        origen                  VARCHAR(150) NOT NULL,
        destino                 VARCHAR(150) NOT NULL,
        motivo                  TEXT NOT NULL,
        fecha_inicio            DATE NOT NULL,
        fecha_fin               DATE NOT NULL,
        dias                    INTEGER NOT NULL,

        -- Cometido Funcionario
        sale_de_comuna          BOOLEAN NOT NULL DEFAULT FALSE,
        sale_de_region          BOOLEAN NOT NULL DEFAULT FALSE,
        requiere_movilizacion   BOOLEAN NOT NULL DEFAULT FALSE,
        monto_movilizacion      NUMERIC(10,0),
        vehiculo_institucional  VARCHAR(30),

        -- Comisión de Servicio
        pernocta                BOOLEAN NOT NULL DEFAULT FALSE,
        decreto_asociado        VARCHAR(50),
        documento_respaldo      TEXT,

        -- Viático (aplica a ambos, con reglas distintas)
        requiere_viatico        BOOLEAN NOT NULL DEFAULT FALSE,
        tipo_viatico            VARCHAR(10) CHECK (tipo_viatico IN ('completo', 'parcial')),
        monto_viatico           NUMERIC(10,0),

        -- Workflow
        estado                  VARCHAR(20) NOT NULL DEFAULT 'pendiente'
          CHECK (estado IN ('pendiente', 'aprobado_jefatura', 'aprobado_direccion', 'rechazado')),
        aprobado_jefatura_por   INTEGER REFERENCES usuarios(id),
        aprobado_jefatura_en    TIMESTAMPTZ,
        aprobado_direccion_por  INTEGER REFERENCES usuarios(id),
        aprobado_direccion_en   TIMESTAMPTZ,
        rechazado_por           INTEGER REFERENCES usuarios(id),
        rechazado_en            TIMESTAMPTZ,
        observaciones_rechazo   TEXT,

        creado_por              INTEGER REFERENCES usuarios(id),
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

        CONSTRAINT cometido_comision_fecha_valida CHECK (fecha_fin >= fecha_inicio),
        CONSTRAINT cometido_comision_dias_positivos CHECK (dias > 0)
      );

      CREATE INDEX IF NOT EXISTS idx_cometidos_comisiones_funcionario
        ON cometidos_comisiones(funcionario_id, fecha_inicio DESC);
      CREATE INDEX IF NOT EXISTS idx_cometidos_comisiones_tipo_anio
        ON cometidos_comisiones(tipo, funcionario_id, fecha_inicio);
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
