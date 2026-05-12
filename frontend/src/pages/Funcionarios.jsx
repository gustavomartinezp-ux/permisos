import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Plus, Users, ChevronRight, Upload, FileDown, UserX } from 'lucide-react';
import { funcionariosApi, solicitudesApi } from '../api/client';
import { generarReporteFuncionario } from '../utils/reportePDF';
import { useAuth } from '../context/AuthContext';
import SolicitudModal from '../components/SolicitudModal';
import FuncionarioModal from '../components/FuncionarioModal';
import CargaMasivaModal from '../components/CargaMasivaModal';
import toast from 'react-hot-toast';

function FuncionarioCard({ funcionario, index, onSolicitar }) {
  const totalAsignado = funcionario.saldos?.reduce((s, x) => s + x.dias_asignados, 0) || 0;
  const totalUsado = funcionario.saldos?.reduce((s, x) => s + x.dias_usados, 0) || 0;
  const porcentaje = totalAsignado > 0 ? Math.round((totalUsado / totalAsignado) * 100) : 0;
  const [generandoPDF, setGenerandoPDF] = useState(false);

  const descargarPDF = async (e) => {
    e.preventDefault();
    setGenerandoPDF(true);
    try {
      const anio = new Date().getFullYear();
      const [detalle, sols] = await Promise.all([
        funcionariosApi.obtener(funcionario.id, anio),
        solicitudesApi.listar({ funcionario_id: funcionario.id, limit: 200 }),
      ]);
      const solsAnio = (sols.data.solicitudes || []).filter(s =>
        new Date(s.fecha_inicio).getFullYear() === anio
      );
      generarReporteFuncionario(detalle.data, solsAnio);
    } catch {
      alert('Error al generar el reporte');
    } finally {
      setGenerandoPDF(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card-hover p-4"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
            funcionario.activo === false ? 'bg-dark-100 text-dark-400' : 'bg-brand-100 text-brand-700'
          }`}>
            {funcionario.activo === false
              ? <UserX size={16} />
              : <>{funcionario.nombres[0]}{funcionario.apellidos[0]}</>
            }
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`font-semibold text-sm ${funcionario.activo === false ? 'text-dark-400' : 'text-dark-800'}`}>
                {funcionario.nombres} {funcionario.apellidos}
              </p>
              {funcionario.sector && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  { Verde: 'bg-green-100 text-green-700', Azul: 'bg-blue-100 text-blue-700', Amarillo: 'bg-yellow-100 text-yellow-700', Rojo: 'bg-red-100 text-red-700', Lila: 'bg-purple-100 text-purple-700', SAR: 'bg-cyan-100 text-cyan-700' }[funcionario.sector] || 'bg-dark-100 text-dark-600'
                }`}>
                  {funcionario.sector}
                </span>
              )}
              {funcionario.area && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">
                  {funcionario.area}
                </span>
              )}
            </div>
            <p className="text-xs text-dark-500">{funcionario.cargo}</p>
            {funcionario.servicio && (
              <p className="text-xs text-dark-400">{funcionario.servicio}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={descargarPDF}
            disabled={generandoPDF}
            title="Descargar reporte PDF"
            className="p-1.5 rounded-lg hover:bg-emerald-50 text-dark-400 hover:text-emerald-600 transition-colors"
          >
            {generandoPDF
              ? <span className="animate-spin h-3.5 w-3.5 border border-emerald-600 border-t-transparent rounded-full inline-block" />
              : <FileDown size={15} />
            }
          </button>
          <Link
            to={`/funcionarios/${funcionario.id}`}
            className="p-1.5 rounded-lg hover:bg-dark-100 text-dark-400 hover:text-dark-600 transition-colors"
          >
            <ChevronRight size={17} />
          </Link>
        </div>
      </div>

      {/* Saldos mini */}
      <div className="space-y-1.5 mb-3">
        {funcionario.saldos?.slice(0, 3).map((s) => {
          const disp = s.dias_asignados - s.dias_usados - (s.dias_pendientes || 0);
          return (
            <div key={s.tipo_id} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-dark-500 flex-1 truncate">{s.tipo_nombre}</span>
              <span className="text-xs font-medium text-dark-700">{disp}/{s.dias_asignados}</span>
            </div>
          );
        })}
      </div>

      {/* Barra total */}
      <div>
        <div className="flex justify-between text-xs text-dark-400 mb-1">
          <span>Uso total</span>
          <span>{totalUsado}/{totalAsignado} días ({porcentaje}%)</span>
        </div>
        <div className="h-1.5 bg-dark-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all"
            style={{ width: `${Math.min(porcentaje, 100)}%` }}
          />
        </div>
      </div>

      {onSolicitar && (
        <button
          onClick={() => onSolicitar(funcionario)}
          className="mt-3 w-full text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center justify-center gap-1 py-1.5 rounded-lg hover:bg-brand-50 transition-colors"
        >
          <Plus size={13} />
          Nueva solicitud
        </button>
      )}
    </motion.div>
  );
}

export default function Funcionarios() {
  const { esSupervisor, esAdmin } = useAuth();
  const [funcionarios, setFuncionarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [verPasivos, setVerPasivos] = useState(false);
  const [modalSolicitud, setModalSolicitud] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  const cargar = () => {
    setCargando(true);
    const params = verPasivos ? { activo: 'false' } : {};
    funcionariosApi.listar(params)
      .then(({ data }) => setFuncionarios(data))
      .catch(() => toast.error('Error al cargar funcionarios'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, [verPasivos]);

  const filtrados = funcionarios.filter((f) => {
    if (verPasivos ? f.activo !== false : f.activo === false) return false;
    const q = busqueda.toLowerCase();
    return (
      f.nombres.toLowerCase().includes(q) ||
      f.apellidos.toLowerCase().includes(q) ||
      f.rut?.toLowerCase().includes(q) ||
      f.cargo?.toLowerCase().includes(q) ||
      f.servicio?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Funcionarios</h1>
          <p className="text-dark-500 text-sm mt-0.5">
            {funcionarios.length} funcionario(s) {verPasivos ? 'pasivo(s)' : 'activo(s)'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          {esAdmin && (
            <div className="flex rounded-lg border border-dark-200 overflow-hidden text-xs font-medium">
              <button
                onClick={() => { setVerPasivos(false); setBusqueda(''); }}
                className={`px-3 py-1.5 transition-colors ${!verPasivos ? 'bg-brand-600 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}
              >
                Activos
              </button>
              <button
                onClick={() => { setVerPasivos(true); setBusqueda(''); }}
                className={`px-3 py-1.5 transition-colors ${verPasivos ? 'bg-dark-700 text-white' : 'bg-white text-dark-600 hover:bg-dark-50'}`}
              >
                Pasivos
              </button>
            </div>
          )}
          {esAdmin && !verPasivos && (
            <>
              <button onClick={() => setShowBulk(true)} className="btn-secondary">
                <Upload size={15} />
                <span className="hidden sm:inline">Carga masiva</span>
              </button>
              <button onClick={() => setShowNuevo(true)} className="btn-primary">
                <Plus size={15} />
                <span className="hidden sm:inline">Nuevo</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400" />
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, RUT, cargo o servicio..."
          className="input-field pl-10 bg-white"
        />
      </div>

      {/* Grid */}
      {cargando ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="card p-4 h-48 animate-pulse bg-dark-100" />
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-dark-400">
          <Users size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">Sin resultados</p>
          <p className="text-sm mt-1">
            {busqueda
              ? `No se encontraron funcionarios para "${busqueda}"`
              : verPasivos
              ? 'No hay funcionarios pasivos registrados'
              : 'No hay funcionarios registrados'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map((f, i) => (
            <FuncionarioCard
              key={f.id}
              funcionario={f}
              index={i}
              onSolicitar={esSupervisor ? setModalSolicitud : null}
            />
          ))}
        </div>
      )}

      {modalSolicitud && (
        <SolicitudModal
          funcionario={modalSolicitud}
          onClose={() => setModalSolicitud(null)}
          onSuccess={cargar}
        />
      )}

      {showNuevo && (
        <FuncionarioModal
          onClose={() => setShowNuevo(false)}
          onSuccess={cargar}
        />
      )}

      {showBulk && (
        <CargaMasivaModal
          onClose={() => setShowBulk(false)}
          onSuccess={cargar}
        />
      )}
    </div>
  );
}
