'use strict';

// Reglas del Permiso de Estamento:
//   1. Solo planta (Indefinido) y contrata (Plazo Fijo); no honorarios ni suplencias.
//   2. Jornada de al menos 33 hrs (suma del contrato principal y el segundo).
//   3. Se toma el mismo día del estamento o hasta 15 días corridos después
//      (se cuentan aunque el día caiga en fin de semana o feriado).
//   4. El funcionario debe tener su estamento registrado en la ficha.
const HORAS_MINIMAS = 33;
const DIAS_PLAZO = 15;

// Día de cada estamento ('MM-DD'), según el calendario "Celebración Día
// Estamentario" del CESFAM. Odontólogo no figura: se usa el día nacional (3/10).
// Un estamento sin fecha aquí no valida la regla de los 15 días.
const DIAS_ESTAMENTO = {
  AUXILIAR: '03-19', GUARDIA: '03-19', CHOFER: '03-19',        // auxiliares de servicio
  TENS: '03-26', 'TENS DENTAL': '03-26', 'TENS PODOLOGIA': '03-26',
  'TERAPEUTA OCUPACIONAL': '04-04',
  NUTRICIONISTA: '05-06', KINESIOLOGO: '05-06',
  ENFERMERA: '05-12',
  'INGENIERO EN ADMINISTRACION': '05-14', 'INGENIERO INFORMATICO': '05-14',
  'INGENIERO EN INFORMATICA BIOMEDICA': '05-14',
  PODOLOGO: '07-25',
  ADMINISTRATIVO: '08-28',
  MATRONA: '09-01',
  'TECNOLOGO MEDICO': '10-02',
  ODONTOLOGO: '10-03',
  'PROFESOR DE EDUCACION FISICA': '10-16',
  PSICOLOGO: '11-10',
  'ASISTENTE SOCIAL': '11-11',
  FONOAUDIOLOGO: '11-21', 'EDUCADORA DE PARVULOS': '11-21',
  'QUIMICO FARMACEUTICO': '12-01',
  MEDICO: '12-03',
};

// Las fichas escriben el mismo estamento de varias formas (con/sin tilde,
// abreviado, masculino/femenino): se normaliza a una sola clave.
const ALIAS = {
  'TEC PARAMEDICO': 'TENS',
  ENFERMERO: 'ENFERMERA',
  MATRON: 'MATRONA',
  'QUIM FARMACEUT': 'QUIMICO FARMACEUTICO',
  'QUIM FARMACEUTICO': 'QUIMICO FARMACEUTICO',
  'ING EN ADMINISTRACION': 'INGENIERO EN ADMINISTRACION',
  'ING INFORMATICO': 'INGENIERO INFORMATICO',
  'TERAPEUTA OCUPACIONA': 'TERAPEUTA OCUPACIONAL',
  'PROF.ED.FISICA': 'PROFESOR DE EDUCACION FISICA',
  'TRABAJADOR SOCIAL': 'ASISTENTE SOCIAL',
  'TRABAJADORA SOCIAL': 'ASISTENTE SOCIAL',
};

const normalizarEstamento = (texto) => {
  const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();
  return ALIAS[t] || t;
};

const esPermisoEstamento = (tipo) => tipo?.codigo === 'ESTAMENTO';

const sumarDias = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().substring(0, 10);
};

// Devuelve el mensaje de error o null si la solicitud cumple las reglas.
// funcionario: { escalafon, tipo_contrato, tipo_contrato_2, horas_contrato, horas_contrato_2 }
function errorPermisoEstamento(funcionario, fechaInicio) {
  const f = funcionario || {};
  const contratos = [f.tipo_contrato, f.tipo_contrato_2].filter(Boolean).map((c) => c.toLowerCase());
  if (!contratos.some((c) => c.includes('indefinido') || c.includes('plazo fijo'))) {
    return 'El Permiso de Estamento es solo para funcionarios de planta o contrata';
  }
  const horas = (Number(f.horas_contrato) || 0) + (f.tipo_contrato_2 ? Number(f.horas_contrato_2) || 0 : 0);
  if (horas < HORAS_MINIMAS) {
    return `El Permiso de Estamento requiere una jornada de al menos ${HORAS_MINIMAS} hrs (el funcionario tiene ${horas} hrs)`;
  }
  const estamento = normalizarEstamento(f.escalafon);
  if (!estamento) return 'Falta registrar el estamento del funcionario en su ficha';

  const mmdd = DIAS_ESTAMENTO[estamento];
  if (!mmdd) return null;
  const fecha = String(fechaInicio).substring(0, 10);
  const anio = Number(fecha.substring(0, 4));
  // El plazo puede cruzar el año (día del estamento a fines de diciembre). Si el
  // día cae sábado o domingo se celebra desde el viernes anterior (ej. 21/11/2026
  // sábado → viernes 20), así que la ventana parte ese viernes.
  const dentro = [anio, anio - 1].some((a) => {
    const dia = `${a}-${mmdd}`;
    const dow = new Date(`${dia}T12:00:00Z`).getUTCDay();
    const desde = dow === 6 ? sumarDias(dia, -1) : dow === 0 ? sumarDias(dia, -2) : dia;
    return fecha >= desde && fecha <= sumarDias(dia, DIAS_PLAZO);
  });
  if (dentro) return null;
  const [mm, dd] = mmdd.split('-');
  return `El Permiso de Estamento de ${estamento} se toma el ${dd}/${mm} o hasta ${DIAS_PLAZO} días corridos después`;
}

module.exports = { errorPermisoEstamento, esPermisoEstamento, normalizarEstamento, DIAS_ESTAMENTO, HORAS_MINIMAS, DIAS_PLAZO };
