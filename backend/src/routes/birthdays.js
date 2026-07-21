const express = require('express');
const { pool } = require('../db');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();
router.use(verificarToken);

// Cumpleañeros del día: se calcula en vivo comparando día/mes contra
// fecha_nacimiento — no requiere cron ni tabla aparte. Respeta el opt-out
// (mostrar_cumpleanos) y solo incluye funcionarios activos.
router.get('/today', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.id, f.nombres, f.apellidos, f.cargo, f.sector, f.area, f.foto_url,
              COUNT(bl.id) AS likes_count,
              COALESCE(BOOL_OR(bl.liker_usuario_id = $1), false) AS ya_le_di_like
       FROM funcionarios f
       LEFT JOIN birthday_likes bl
         ON bl.birthday_funcionario_id = f.id AND bl.dia = CURRENT_DATE
       WHERE f.activo = true
         AND f.mostrar_cumpleanos = true
         AND f.fecha_nacimiento IS NOT NULL
         AND EXTRACT(MONTH FROM f.fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM f.fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)
       GROUP BY f.id
       ORDER BY f.nombres`,
      [req.usuario.id]
    );
    res.json(rows.map((r) => ({ ...r, likes_count: parseInt(r.likes_count, 10) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener cumpleañeros del día' });
  }
});

// Toggle de "like" — el servidor decide like/unlike según lo que ya exista,
// nunca confía en el body, para que no se pueda forzar un estado arbitrario.
router.post('/:id/like', async (req, res) => {
  const funcId = req.params.id;
  try {
    const valido = await pool.query(
      `SELECT 1 FROM funcionarios
       WHERE id = $1 AND activo = true AND mostrar_cumpleanos = true
         AND fecha_nacimiento IS NOT NULL
         AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(DAY FROM fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)`,
      [funcId]
    );
    if (valido.rows.length === 0) {
      return res.status(404).json({ error: 'Hoy no es cumpleaños de este funcionario' });
    }

    const existente = await pool.query(
      `SELECT id FROM birthday_likes
       WHERE birthday_funcionario_id = $1 AND liker_usuario_id = $2 AND dia = CURRENT_DATE`,
      [funcId, req.usuario.id]
    );

    let yaLeDiLike;
    if (existente.rows.length > 0) {
      await pool.query('DELETE FROM birthday_likes WHERE id = $1', [existente.rows[0].id]);
      yaLeDiLike = false;
    } else {
      await pool.query(
        `INSERT INTO birthday_likes (birthday_funcionario_id, liker_usuario_id) VALUES ($1, $2)`,
        [funcId, req.usuario.id]
      );
      yaLeDiLike = true;
    }

    const conteo = await pool.query(
      `SELECT COUNT(*) FROM birthday_likes WHERE birthday_funcionario_id = $1 AND dia = CURRENT_DATE`,
      [funcId]
    );
    res.json({ ya_le_di_like: yaLeDiLike, likes_count: parseInt(conteo.rows[0].count, 10) });
  } catch (err) {
    if (err.code === '23505') {
      // Choque de concurrencia (doble clic simultáneo) — no es un error real.
      return res.status(409).json({ error: 'Intenta de nuevo' });
    }
    console.error(err);
    res.status(500).json({ error: 'Error al procesar el like' });
  }
});

// Listado de quién ha felicitado hoy, para el popover del contador.
router.get('/:id/likers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id AS usuario_id, u.email, f.nombres, f.apellidos, f.foto_url
       FROM birthday_likes bl
       JOIN usuarios u ON u.id = bl.liker_usuario_id
       LEFT JOIN funcionarios f ON f.id = u.funcionario_id
       WHERE bl.birthday_funcionario_id = $1 AND bl.dia = CURRENT_DATE
       ORDER BY bl.created_at`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las felicitaciones' });
  }
});

module.exports = router;
