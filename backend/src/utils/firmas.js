'use strict';
const { esSoloAutoservicio, alcanceSupervisor, dentroDeAlcance } = require('../middleware/rbac');

// Firma electrónica simple de los formularios. La firma de cada etapa se toma
// de la cuenta que actúa: el solicitante al enviar (o al firmar después, si la
// ingresó otra persona), la jefatura al pre-aprobar y Dirección al aprobar.
// Cada solicitud guarda el id de la firma vigente en ese momento.

// Imagen PNG en base64 (canvas.toDataURL), hasta ~150 KB
const MAX_IMAGEN = 200000;
const imagenValida = (img) => typeof img === 'string'
  && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(img) && img.length <= MAX_IMAGEN;

// Subconsulta: firma activa del funcionario vinculado a la cuenta $n
const firmaActivaDeUsuario = (n) =>
  `(SELECT fi.id FROM firmas fi JOIN usuarios u ON u.funcionario_id = fi.funcionario_id
    WHERE u.id = $${n} AND fi.activa)`;

// Marca como firmadas por el solicitante las solicitudes recién creadas, solo
// si quien las ingresó es el propio funcionario (no a nombre de terceros).
async function firmarComoSolicitante(client, tabla, req, ids) {
  if (!req.usuario.funcionario_id) return;
  await client.query(
    `UPDATE ${tabla}
     SET firma_solicitante_en = NOW(),
         firma_solicitante_id = (SELECT id FROM firmas WHERE funcionario_id = $1 AND activa)
     WHERE id = ANY($2::int[]) AND funcionario_id = $1`,
    [req.usuario.funcionario_id, ids]
  );
}

// ¿Puede el usuario ver los documentos de este funcionario? (mismo criterio que los listados)
function puedeVerDocumentosDe(req, funcionario) {
  if (req.usuario.funcionario_id && req.usuario.funcionario_id == funcionario.id) return true;
  if (esSoloAutoservicio(req)) return false;
  const alcance = alcanceSupervisor(req);
  if (!alcance || (!alcance.sector && !alcance.area)) return true;
  return dentroDeAlcance(alcance, funcionario);
}

// { nombre, fecha, imagen } de una etapa firmada, o null
const etapa = (firmada, nombre, fecha, imagen) => (firmada ? { nombre: nombre || null, fecha, imagen: imagen || null } : null);

module.exports = { imagenValida, firmaActivaDeUsuario, firmarComoSolicitante, puedeVerDocumentosDe, etapa };
