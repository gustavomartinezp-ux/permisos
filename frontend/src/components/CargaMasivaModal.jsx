import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { funcionariosApi, tiposPermisosApi } from '../api/client';
import toast from 'react-hot-toast';

const TIPOS_CONTRATO = ['Indefinido', 'Plazo Fijo', 'Honorarios', 'Suplencia'];

// ── Genera plantilla Excel ───────────────────────────────────────────────────
function generarTemplate(tipos) {
  const encabezados = [
    'RUT', 'Nombres', 'Apellidos', 'Correo', 'Cargo',
    'Servicio', 'Establecimiento', 'Tipo Contrato', 'Horas',
    'Fecha Ingreso',
    ...tipos.map(t => `Días ${t.nombre}`),
  ];
  const ejemplo = [
    '12.345.678-9', 'María', 'González', 'maria@cesfam.cl',
    'Médico General', 'Medicina General', 'CESFAM LOS CERROS',
    'Indefinido', 44, '2020-03-15',
    ...tipos.map(t => t.dias_anuales_max),
  ];

  // Segunda fila de instrucciones
  const instrucciones = [
    '', '', '', '', '', '', '',
    `Opciones: ${TIPOS_CONTRATO.join(' | ')}`,
    'Número entero',
    'Formato: AAAA-MM-DD',
    ...tipos.map(() => 'Número entero'),
  ];

  const ws = XLSX.utils.aoa_to_sheet([encabezados, instrucciones, ejemplo]);

  // Estilo ancho de columnas
  ws['!cols'] = encabezados.map((_, i) => ({ wch: i < 10 ? 22 : 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Funcionarios');
  XLSX.writeFile(wb, 'plantilla_funcionarios.xlsx');
}

// ── Parser Excel ─────────────────────────────────────────────────────────────
function parsearExcel(file, tipos) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // Mapa código → id para saldos
        const mapeoCodigo = {};
        tipos.forEach(t => {
          mapeoCodigo[`días ${t.nombre.toLowerCase()}`] = t.id;
          mapeoCodigo[`dias ${t.nombre.toLowerCase()}`]  = t.id;
          mapeoCodigo[t.codigo.toLowerCase()] = t.id;
        });

        const funcionarios = rows.map((row, i) => {
          // Normalizar claves (sin tildes, minúsculas)
          const r = {};
          Object.entries(row).forEach(([k, v]) => {
            r[k.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')] = v;
          });

          // Extraer saldos por tipo
          const saldos = {};
          Object.entries(mapeoCodigo).forEach(([clave, tipoId]) => {
            const val = r[clave];
            if (val !== undefined && val !== '') saldos[tipoId] = parseInt(val) || 0;
          });

          // Normalizar fecha
          let fechaIngreso = r['fecha ingreso'] || r['fecha_ingreso'] || '';
          if (fechaIngreso instanceof Date) {
            fechaIngreso = fechaIngreso.toISOString().split('T')[0];
          } else if (typeof fechaIngreso === 'number') {
            const d = new Date(Math.round((fechaIngreso - 25569) * 86400 * 1000));
            fechaIngreso = d.toISOString().split('T')[0];
          } else {
            fechaIngreso = String(fechaIngreso).trim();
          }

          // Tipo contrato — normalizar capitalización
          const tipoContratoRaw = String(r['tipo contrato'] || r['tipo_contrato'] || '').trim();
          const tipoContrato = TIPOS_CONTRATO.find(
            t => t.toLowerCase() === tipoContratoRaw.toLowerCase()
          ) || (tipoContratoRaw ? tipoContratoRaw : '');

          const tipoContratoValido = TIPOS_CONTRATO.includes(tipoContrato);

          const horas = r['horas'] || r['horas contrato'] || r['horas_contrato'] || '';
          const horasNum = horas !== '' ? parseInt(horas) || null : null;

          const invalido =
            !r['rut'] || !r['nombres'] || !r['apellidos']
              ? 'Faltan RUT, Nombres o Apellidos'
              : (tipoContratoRaw && !tipoContratoValido)
              ? `Tipo contrato inválido: "${tipoContratoRaw}"`
              : null;

          return {
            fila: i + 2,
            rut:           String(r['rut']          || '').trim(),
            nombres:       String(r['nombres']       || '').trim(),
            apellidos:     String(r['apellidos']     || '').trim(),
            email:         String(r['correo'] || r['email'] || '').trim(),
            cargo:         String(r['cargo']         || '').trim(),
            servicio:      String(r['servicio']      || '').trim(),
            dispositivo:   String(r['establecimiento'] || r['dispositivo'] || '').trim(),
            tipo_contrato: tipoContrato,
            horas_contrato: horasNum,
            fecha_ingreso: fechaIngreso,
            saldos,
            valido: !invalido,
            error: invalido,
          };
        });

        resolve(funcionarios.filter(f => f.rut || f.nombres));
      } catch {
        reject(new Error('No se pudo leer el archivo. Verifica que sea un Excel (.xlsx) válido.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsArrayBuffer(file);
  });
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function CargaMasivaModal({ onClose, onSuccess }) {
  const [tipos, setTipos] = useState([]);
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [mostrarErrores, setMostrarErrores] = useState(false);
  const inputRef = useRef();

  useEffect(() => {
    tiposPermisosApi.listar()
      .then(({ data }) => setTipos(data.filter(t => t.activo)))
      .catch(() => toast.error('Error cargando tipos de permisos'));
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls'].includes(ext)) {
      toast.error('Solo se aceptan archivos Excel (.xlsx o .xls)');
      return;
    }
    try {
      const rows = await parsearExcel(file, tipos);
      setPreview(rows);
      setResultado(null);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleUpload = async () => {
    const validos = preview.filter(f => f.valido);
    if (validos.length === 0) return toast.error('No hay filas válidas para cargar');
    setCargando(true);
    try {
      const { data } = await funcionariosApi.bulk(validos);
      setResultado(data);
      if (data.exitosos > 0) {
        toast.success(`${data.exitosos} funcionario(s) cargados`);
        onSuccess?.();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error en la carga masiva');
    } finally {
      setCargando(false);
    }
  };

  const validCount   = preview?.filter(f =>  f.valido).length || 0;
  const invalidCount = preview?.filter(f => !f.valido).length || 0;

  const columnasFijas = [
    'RUT', 'Nombres', 'Apellidos', 'Correo', 'Cargo',
    'Servicio', 'Establecimiento', 'Tipo Contrato', 'Horas', 'Fecha Ingreso',
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-dark-100 flex-shrink-0">
            <h2 className="font-semibold text-dark-900 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-emerald-500" />
              Carga Masiva de Funcionarios
            </h2>
            <div className="flex items-center gap-2">
              {tipos.length > 0 && (
                <button onClick={() => generarTemplate(tipos)} className="btn-secondary text-xs py-1.5">
                  <Download size={14} />
                  Descargar plantilla
                </button>
              )}
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">

            {/* Zona de drop */}
            {!preview && !resultado && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                onClick={() => inputRef.current.click()}
                className="border-2 border-dashed border-dark-300 rounded-xl p-10 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/50 transition-colors"
              >
                <Upload size={36} className="mx-auto text-dark-300 mb-3" />
                <p className="font-medium text-dark-600">Arrastra tu Excel aquí o haz clic para seleccionar</p>
                <p className="text-sm text-dark-400 mt-1">Formatos: .xlsx, .xls</p>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={(e) => handleFile(e.target.files[0])} />
              </div>
            )}

            {/* Columnas esperadas */}
            {!preview && !resultado && tipos.length > 0 && (
              <div className="card p-4 space-y-3">
                <p className="text-xs font-semibold text-dark-500 uppercase tracking-wide">
                  Columnas esperadas en el Excel
                </p>

                {/* Fijas */}
                <div>
                  <p className="text-xs text-dark-400 mb-1.5 font-medium">Datos del funcionario</p>
                  <div className="flex flex-wrap gap-1.5">
                    {columnasFijas.map(col => (
                      <span key={col} className="text-xs bg-dark-100 text-dark-600 px-2 py-1 rounded font-mono">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Saldos por tipo */}
                <div>
                  <p className="text-xs text-dark-400 mb-1.5 font-medium">Saldos por tipo de permiso (días)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tipos.map(t => (
                      <span key={t.id} className="text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded font-mono">
                        Días {t.nombre}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Notas */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
                  <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                    <Info size={12} />
                    Notas importantes
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                    <li><strong>Tipo Contrato</strong>: {TIPOS_CONTRATO.join(', ')}</li>
                    <li><strong>Establecimiento</strong>: debe coincidir (parcialmente) con un establecimiento registrado</li>
                    <li><strong>Servicio</strong>: debe coincidir con un servicio/unidad registrado</li>
                    <li>El correo crea acceso al sistema con contraseña inicial <strong>cesfam2026</strong></li>
                    <li>Si el RUT ya existe, los datos se actualizan (no se duplica)</li>
                  </ul>
                </div>
              </div>
            )}

            {/* Preview tabla */}
            {preview && !resultado && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-dark-700">{preview.length} fila(s) detectadas</span>
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{validCount} válidas</span>
                    {invalidCount > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{invalidCount} con errores</span>
                    )}
                  </div>
                  <button
                    onClick={() => { setPreview(null); if (inputRef.current) inputRef.current.value = ''; }}
                    className="text-xs text-dark-500 hover:text-dark-700"
                  >
                    Cambiar archivo
                  </button>
                </div>

                <div className="border border-dark-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-xs whitespace-nowrap">
                      <thead className="bg-dark-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">#</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">RUT</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Nombres</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Apellidos</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Cargo</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Servicio</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Establecimiento</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Contrato</th>
                          <th className="px-3 py-2 text-center text-dark-500 font-medium">Horas</th>
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">F. Ingreso</th>
                          {tipos.slice(0, 4).map(t => (
                            <th key={t.id} className="px-3 py-2 text-center text-dark-500 font-medium">
                              {t.codigo}
                            </th>
                          ))}
                          <th className="px-3 py-2 text-left text-dark-500 font-medium">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-100">
                        {preview.map((f) => (
                          <tr key={f.fila} className={f.valido ? '' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-dark-400">{f.fila}</td>
                            <td className="px-3 py-2 font-mono text-dark-700">{f.rut || '—'}</td>
                            <td className="px-3 py-2 text-dark-700">{f.nombres || '—'}</td>
                            <td className="px-3 py-2 text-dark-700">{f.apellidos || '—'}</td>
                            <td className="px-3 py-2 text-dark-500">{f.cargo || '—'}</td>
                            <td className="px-3 py-2 text-dark-500">{f.servicio || '—'}</td>
                            <td className="px-3 py-2 text-dark-500">{f.dispositivo || '—'}</td>
                            <td className="px-3 py-2">
                              {f.tipo_contrato
                                ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                    TIPOS_CONTRATO.includes(f.tipo_contrato)
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}>{f.tipo_contrato}</span>
                                : <span className="text-dark-400">—</span>
                              }
                            </td>
                            <td className="px-3 py-2 text-center text-dark-500">
                              {f.horas_contrato ? `${f.horas_contrato}h` : '—'}
                            </td>
                            <td className="px-3 py-2 text-dark-500">{f.fecha_ingreso || '—'}</td>
                            {tipos.slice(0, 4).map(t => (
                              <td key={t.id} className="px-3 py-2 text-center text-dark-600">
                                {f.saldos[t.id] ?? t.dias_anuales_max}
                              </td>
                            ))}
                            <td className="px-3 py-2">
                              {f.valido
                                ? <CheckCircle2 size={14} className="text-emerald-500" />
                                : <span title={f.error}><AlertCircle size={14} className="text-red-500" /></span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {invalidCount > 0 && (
                  <div className="mt-2 space-y-1">
                    {preview.filter(f => !f.valido).map(f => (
                      <p key={f.fila} className="text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle size={11} />
                        Fila {f.fila} ({f.rut || '?'}): {f.error}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Resultado */}
            {resultado && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-emerald-800">{resultado.mensaje}</p>
                    {resultado.errores?.length > 0 && (
                      <p className="text-sm text-emerald-600">{resultado.errores.length} fila(s) con errores</p>
                    )}
                  </div>
                </div>

                {resultado.errores?.length > 0 && (
                  <div>
                    <button
                      onClick={() => setMostrarErrores(!mostrarErrores)}
                      className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                    >
                      {mostrarErrores ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      Ver filas con error ({resultado.errores.length})
                    </button>
                    {mostrarErrores && (
                      <div className="mt-2 space-y-1">
                        {resultado.errores.map((e, i) => (
                          <div key={i} className="text-xs bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                            <span className="font-medium text-red-700">Fila {e.fila} ({e.rut}):</span>{' '}
                            <span className="text-red-600">{e.error}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 pt-3 border-t border-dark-100 flex gap-3 flex-shrink-0">
            <button onClick={onClose} className="btn-secondary flex-1">
              {resultado ? 'Cerrar' : 'Cancelar'}
            </button>
            {preview && !resultado && (
              <button
                onClick={handleUpload}
                disabled={cargando || validCount === 0}
                className="btn-primary flex-1 justify-center"
              >
                {cargando
                  ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  : `Cargar ${validCount} funcionario(s)`
                }
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
