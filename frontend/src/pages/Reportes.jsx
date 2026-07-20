import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BarChart2, Users, FileText, Download, Filter, RefreshCw,
  TrendingDown, Calendar, Clock, FileSpreadsheet, AlertCircle,
  CheckCircle2, XCircle, Hourglass, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { reportesApi, tiposPermisosApi, reporteTareasApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || 'https://cesfam-permisos-api.onrender.com/api';

const TABS = [
  { key: 'dashboard',  label: 'Dashboard',    icon: BarChart2  },
  { key: 'permisos',   label: 'Permisos',     icon: FileText   },
  { key: 'ausentismo', label: 'Ausentismo',   icon: TrendingDown },
  { key: 'ejecutivos', label: 'Reportes Ejecutivos', icon: Hourglass },
  { key: 'exportar',   label: 'Exportar',     icon: Download   },
];

const ESTADO_BADGE = {
  pendiente:    'bg-amber-100  text-amber-700',
  pre_aprobado: 'bg-blue-100   text-blue-700',
  aprobado:     'bg-emerald-100 text-emerald-700',
  rechazado:    'bg-red-100    text-red-700',
  reintegrado:  'bg-purple-100 text-purple-700',
};

const SECTORES = ['Verde','Azul','Amarillo','Rojo','Lila'];

// ─── Descarga autenticada ──────────────────────────────────────────────────────
async function descargarArchivo(endpoint, filename, setDescargando) {
  setDescargando(filename);
  try {
    const token = localStorage.getItem('token');
    const resp  = await fetch(`${API_BASE}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || 'Error al descargar');
    }
    const blob = await resp.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Archivo descargado');
  } catch (err) {
    toast.error(err.message || 'Error al descargar');
  } finally {
    setDescargando(null);
  }
}

// ─── Tab Dashboard ─────────────────────────────────────────────────────────────
function TabDashboard({ anio }) {
  const [stats, setStats]   = useState(null);
  const [cargando, setC]    = useState(true);

  useEffect(() => {
    setC(true);
    reportesApi.estadisticas({ anio })
      .then(({ data }) => setStats(data))
      .catch(() => toast.error('Error al cargar estadísticas'))
      .finally(() => setC(false));
  }, [anio]);

  if (cargando) return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <div key={i} className="card h-28 animate-pulse bg-dark-100" />)}
    </div>
  );
  if (!stats) return null;

  const kpis = [
    { label: 'Funcionarios activos',    value: stats.funcionarios.activos,          sub: `${stats.funcionarios.inactivos} inactivos`,          color: 'bg-brand-500',    icon: Users },
    { label: 'Permisos activos hoy',    value: stats.permisos_activos_hoy,          sub: 'con fecha vigente',                                  color: 'bg-teal-500',     icon: Calendar },
    { label: 'Pendientes de aprobación',value: stats.solicitudes.pendientes,        sub: `${stats.solicitudes.pre_aprobadas} pre-aprobadas`,   color: 'bg-amber-500',    icon: Hourglass },
    { label: 'Aprobadas este año',      value: stats.solicitudes.aprobadas,         sub: `${stats.solicitudes.rechazadas} rechazadas`,         color: 'bg-emerald-500',  icon: CheckCircle2 },
    { label: 'Hrs compensat. disponibles', value: `${stats.horas_compensatorias}h`, sub: 'acumuladas activas',                                 color: 'bg-purple-500',   icon: Clock },
    { label: 'Ausentismo 180 días',     value: stats.ausentismo_180.dias,           sub: `${stats.ausentismo_180.funcionarios} funcionarios`,  color: 'bg-red-500',      icon: TrendingDown },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {kpis.map(({ label, value, sub, color, icon: Icon }) => (
          <motion.div key={label} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            className="card p-4">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <p className="text-xs text-dark-500 font-medium mb-1">{label}</p>
                <p className="text-2xl font-bold text-dark-900">{value}</p>
                <p className="text-xs text-dark-400 mt-0.5">{sub}</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon size={20} className="text-white" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Desglose solicitudes */}
      <div className="card p-5">
        <h3 className="font-semibold text-dark-800 mb-4 flex items-center gap-2">
          <FileText size={16} className="text-brand-500" />
          Solicitudes {anio} por estado
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Pendientes',    val: stats.solicitudes.pendientes,    cls: 'bg-amber-50  border-amber-200  text-amber-700' },
            { label: 'Pre-aprobadas', val: stats.solicitudes.pre_aprobadas, cls: 'bg-blue-50   border-blue-200   text-blue-700'  },
            { label: 'Aprobadas',     val: stats.solicitudes.aprobadas,     cls: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { label: 'Rechazadas',    val: stats.solicitudes.rechazadas,    cls: 'bg-red-50    border-red-200    text-red-700'   },
          ].map(({ label, val, cls }) => (
            <div key={label} className={`rounded-xl border p-3 text-center ${cls}`}>
              <p className="text-2xl font-bold">{val}</p>
              <p className="text-xs font-medium mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab Permisos ──────────────────────────────────────────────────────────────
function TabPermisos() {
  const [data,     setData]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [tipos,    setTipos]    = useState([]);
  const [page,     setPage]     = useState(1);
  const [cargando, setC]        = useState(false);
  const [filtros,  setFiltros]  = useState({
    fecha_inicio: '', fecha_fin: '', tipo_permiso_id: '', estado: '', sector: '',
  });
  const [generando, setGenerando] = useState(null); // 'pdf' | 'excel' | null
  const LIMIT = 50;

  const generarEjecutivo = async (formato) => {
    setGenerando(formato);
    try {
      await reporteTareasApi.crear({ report_type: 'permisos', formato, filtros });
      toast.success('Tu reporte se está procesando. Puedes seguir usando el sistema — te avisaremos cuando esté listo.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo iniciar la generación del reporte');
    } finally {
      setGenerando(null);
    }
  };

  useEffect(() => {
    tiposPermisosApi.listar().then(({ data }) => setTipos(data)).catch(() => {});
  }, []);

  const cargar = useCallback(() => {
    setC(true);
    const params = { page, limit: LIMIT };
    Object.entries(filtros).forEach(([k, v]) => { if (v) params[k] = v; });
    reportesApi.permisos(params)
      .then(({ data }) => { setData(data.data); setTotal(data.total); })
      .catch(() => toast.error('Error al cargar permisos'))
      .finally(() => setC(false));
  }, [filtros, page]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalPags = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={15} className="text-dark-400" />
          <span className="text-sm font-medium text-dark-700">Filtros</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <input type="date" value={filtros.fecha_inicio}
            onChange={e => setFiltros(p => ({ ...p, fecha_inicio: e.target.value }))}
            className="input-field text-sm" placeholder="Desde" />
          <input type="date" value={filtros.fecha_fin}
            onChange={e => setFiltros(p => ({ ...p, fecha_fin: e.target.value }))}
            className="input-field text-sm" placeholder="Hasta" />
          <select value={filtros.tipo_permiso_id}
            onChange={e => setFiltros(p => ({ ...p, tipo_permiso_id: e.target.value }))}
            className="input-field text-sm">
            <option value="">Todos los tipos</option>
            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
          <select value={filtros.estado}
            onChange={e => setFiltros(p => ({ ...p, estado: e.target.value }))}
            className="input-field text-sm">
            <option value="">Todos los estados</option>
            {['pendiente','pre_aprobado','aprobado','rechazado','reintegrado'].map(s => (
              <option key={s} value={s}>{s.replace('_',' ')}</option>
            ))}
          </select>
          <select value={filtros.sector}
            onChange={e => setFiltros(p => ({ ...p, sector: e.target.value }))}
            className="input-field text-sm">
            <option value="">Todos los sectores</option>
            {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => { setPage(1); cargar(); }}
            className="btn-primary text-sm py-1.5">
            <RefreshCw size={13} /> Aplicar
          </button>
          <button onClick={() => { setFiltros({ fecha_inicio:'',fecha_fin:'',tipo_permiso_id:'',estado:'',sector:'' }); setPage(1); }}
            className="btn-secondary text-sm py-1.5">
            Limpiar
          </button>
          <span className="flex-1" />
          <button onClick={() => generarEjecutivo('pdf')} disabled={!!generando}
            className="btn-secondary text-sm py-1.5" title="Generar reporte ejecutivo en PDF (procesamiento en segundo plano)">
            {generando === 'pdf'
              ? <span className="animate-spin h-3.5 w-3.5 border-2 border-dark-400 border-t-transparent rounded-full" />
              : <FileText size={13} />}
            PDF Ejecutivo
          </button>
          <button onClick={() => generarEjecutivo('excel')} disabled={!!generando}
            className="btn-secondary text-sm py-1.5" title="Generar reporte ejecutivo en Excel (procesamiento en segundo plano)">
            {generando === 'excel'
              ? <span className="animate-spin h-3.5 w-3.5 border-2 border-dark-400 border-t-transparent rounded-full" />
              : <FileSpreadsheet size={13} />}
            Excel
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-100 flex items-center justify-between">
          <span className="text-sm font-medium text-dark-700">{total} resultado(s)</span>
          {cargando && <RefreshCw size={14} className="animate-spin text-dark-400" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-50 border-b border-dark-100">
              <tr>
                {['Funcionario','RUT','Cargo','Tipo','Desde','Hasta','Días','Estado'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-dark-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-50">
              {data.map(r => (
                <tr key={r.id} className="hover:bg-dark-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-dark-800 whitespace-nowrap">{r.apellidos} {r.nombres}</td>
                  <td className="px-4 py-2.5 text-dark-500 font-mono text-xs">{r.rut}</td>
                  <td className="px-4 py-2.5 text-dark-500 text-xs whitespace-nowrap">{r.cargo}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${r.color}20`, color: r.color }}>
                      {r.tipo_permiso}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-dark-500 text-xs whitespace-nowrap">
                    {r.fecha_inicio ? format(parseISO(r.fecha_inicio), 'd MMM yyyy', { locale: es }) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-dark-500 text-xs whitespace-nowrap">
                    {r.fecha_fin ? format(parseISO(r.fecha_fin), 'd MMM yyyy', { locale: es }) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold text-dark-700">{r.dias_solicitados}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ESTADO_BADGE[r.estado] || ''}`}>
                      {r.estado?.replace('_',' ')}
                    </span>
                  </td>
                </tr>
              ))}
              {!cargando && data.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-dark-400 text-sm">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Paginación */}
        {totalPags > 1 && (
          <div className="px-5 py-3 border-t border-dark-100 flex items-center justify-between">
            <span className="text-xs text-dark-400">Pág. {page} de {totalPags}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
                className="p-1.5 rounded-lg hover:bg-dark-100 disabled:opacity-40 text-dark-500">
                <ChevronLeft size={15} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPags, p+1))} disabled={page === totalPags}
                className="p-1.5 rounded-lg hover:bg-dark-100 disabled:opacity-40 text-dark-500">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab Ausentismo ────────────────────────────────────────────────────────────
function TabAusentismo() {
  const [data,    setData]    = useState(null);
  const [sector,  setSector]  = useState('');
  const [cargando, setC]      = useState(true);

  const cargar = useCallback(() => {
    setC(true);
    reportesApi.ausentismo(sector ? { sector } : {})
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Error al cargar ausentismo'))
      .finally(() => setC(false));
  }, [sector]);

  useEffect(() => { cargar(); }, [cargar]);

  if (cargando) return <div className="card h-48 animate-pulse bg-dark-100" />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Filtro sector */}
      <div className="flex items-center gap-3">
        <select value={sector} onChange={e => setSector(e.target.value)} className="input-field w-48 text-sm">
          <option value="">Todos los sectores</option>
          {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={cargar} className="btn-secondary text-sm py-1.5">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>

      {/* Período */}
      <div className="card p-4 bg-amber-50 border border-amber-200">
        <p className="text-xs text-amber-600 font-semibold">Período analizado — últimos 180 días corridos</p>
        <p className="text-sm text-amber-800 mt-0.5 font-medium">
          {data.periodo.desde} → {data.periodo.hasta}
        </p>
      </div>

      {/* KPIs resumen */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Funcionarios ausentes', value: data.resumen.funcionarios_ausentes, color: 'text-red-600' },
          { label: 'Total días perdidos',   value: data.resumen.total_dias,            color: 'text-orange-600' },
          { label: 'Total solicitudes',     value: data.resumen.total_solicitudes,     color: 'text-dark-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            <p className="text-xs text-dark-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* Ranking funcionarios */}
        <div className="card">
          <div className="px-5 py-3 border-b border-dark-100">
            <h3 className="font-semibold text-dark-800 text-sm">Top 10 — Más días ausentes</h3>
          </div>
          <div className="divide-y divide-dark-50">
            {data.porFuncionario.slice(0, 10).map((f, i) => (
              <div key={f.id} className="px-5 py-2.5 flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < 3 ? 'bg-red-100 text-red-600' : 'bg-dark-100 text-dark-500'}`}>
                  {i+1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark-800 truncate">{f.apellidos} {f.nombres}</p>
                  <p className="text-xs text-dark-400">{f.cargo} · {f.sector}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-dark-800">{f.total_dias} días</p>
                  <p className="text-xs text-dark-400">{f.total_solicitudes} solicitud(es)</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Por tipo */}
        <div className="card">
          <div className="px-5 py-3 border-b border-dark-100">
            <h3 className="font-semibold text-dark-800 text-sm">Días por tipo de permiso</h3>
          </div>
          <div className="divide-y divide-dark-50">
            {data.porTipo.map(t => (
              <div key={t.nombre} className="px-5 py-2.5 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || '#888' }} />
                <p className="text-sm text-dark-700 flex-1 truncate">{t.nombre}</p>
                <div className="text-right">
                  <p className="text-sm font-bold text-dark-800">{t.dias} días</p>
                  <p className="text-xs text-dark-400">{t.total} sol.</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tendencia mensual */}
      {data.porMes.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-dark-800 text-sm mb-4">Tendencia mensual</h3>
          <div className="flex items-end gap-2 h-32">
            {(() => {
              const max = Math.max(...data.porMes.map(m => m.dias), 1);
              return data.porMes.map(m => (
                <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-dark-500 font-medium">{m.dias}</span>
                  <div className="w-full rounded-t bg-brand-400 transition-all"
                    style={{ height: `${(m.dias / max) * 96}px`, minHeight: 4 }} />
                  <span className="text-xs text-dark-400 whitespace-nowrap">
                    {m.mes.slice(5)}
                  </span>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Reportes Ejecutivos (preconcebidos, listos para generar) ──────────────
function TabEjecutivos() {
  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState(null); // `${id}-${formato}`

  useEffect(() => {
    reporteTareasApi.tipos()
      .then(({ data }) => setCatalogo(data.filter((r) => !r.requiereFiltros)))
      .catch(() => toast.error('No se pudo cargar el catálogo de reportes'))
      .finally(() => setCargando(false));
  }, []);

  const generar = async (id, formato) => {
    const clave = `${id}-${formato}`;
    setGenerando(clave);
    try {
      await reporteTareasApi.crear({ report_type: id, formato, filtros: {} });
      toast.success('Tu reporte se está procesando. Puedes seguir usando el sistema — te avisaremos cuando esté listo.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'No se pudo iniciar la generación del reporte');
    } finally {
      setGenerando(null);
    }
  };

  if (cargando) {
    return <div className="card h-48 animate-pulse bg-dark-100" />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-dark-500">
        Reportes preconcebidos, listos para generar con un clic. Se procesan en segundo plano —
        recíbelos en el Centro de Descargas (ícono arriba a la derecha) cuando estén listos.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {catalogo.map((r) => (
          <div key={r.id} className="card p-4 flex flex-col gap-3">
            <div>
              <p className="font-semibold text-dark-800 text-sm">{r.nombre}</p>
              <p className="text-xs text-dark-500 mt-1">{r.descripcion}</p>
            </div>
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => generar(r.id, 'pdf')}
                disabled={!!generando}
                className="btn-secondary text-xs py-1.5 flex-1 justify-center"
              >
                {generando === `${r.id}-pdf`
                  ? <span className="animate-spin h-3 w-3 border-2 border-dark-400 border-t-transparent rounded-full" />
                  : <FileText size={13} />}
                PDF
              </button>
              <button
                onClick={() => generar(r.id, 'excel')}
                disabled={!!generando}
                className="btn-secondary text-xs py-1.5 flex-1 justify-center"
              >
                {generando === `${r.id}-excel`
                  ? <span className="animate-spin h-3 w-3 border-2 border-dark-400 border-t-transparent rounded-full" />
                  : <FileSpreadsheet size={13} />}
                Excel
              </button>
            </div>
          </div>
        ))}
        {catalogo.length === 0 && (
          <p className="text-sm text-dark-400 py-8 text-center col-span-full">Sin reportes disponibles</p>
        )}
      </div>
    </div>
  );
}

// ─── Tab Exportar ──────────────────────────────────────────────────────────────
function TabExportar({ anio }) {
  const [descargando, setDescargando] = useState(null);
  const [filtrosCSV, setFiltrosCSV]   = useState({ fecha_inicio: '', fecha_fin: '', estado: '', sector: '' });

  const descargar = (endpoint, filename) =>
    descargarArchivo(endpoint, filename, setDescargando);

  const buildQuery = (params) => {
    const q = Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    return q ? `?${q}` : '';
  };

  const BtnDescarga = ({ onClick, nombre, desc, ext, color = 'bg-emerald-600 hover:bg-emerald-700' }) => (
    <button onClick={onClick} disabled={descargando === nombre}
      className={`flex items-center gap-3 p-4 rounded-xl text-white transition-all ${color} disabled:opacity-60 w-full`}>
      <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
        {descargando === nombre
          ? <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
          : <FileSpreadsheet size={20} />}
      </div>
      <div className="text-left">
        <p className="font-semibold text-sm">{nombre}</p>
        <p className="text-xs text-white/75">{desc}</p>
      </div>
      <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full font-mono">{ext}</span>
    </button>
  );

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Excel funcionarios */}
      <div className="card p-5 space-y-3">
        <h3 className="font-semibold text-dark-800 flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-emerald-600" />
          Exportación de Funcionarios
        </h3>
        <p className="text-sm text-dark-500">
          Excel profesional con 3 hojas: funcionarios, saldos y ranking de ausentismo.
          Incluye encabezado institucional, filtros automáticos y formato CESFAM.
        </p>
        <BtnDescarga
          onClick={() => descargar(`/reportes/exportar/funcionarios?anio=${anio}`, `funcionarios_${anio}.xlsx`)}
          nombre={`Funcionarios ${anio}`}
          desc="Datos completos + saldos + ausentismo"
          ext=".xlsx"
        />
      </div>

      {/* CSV permisos */}
      <div className="card p-5 space-y-4">
        <h3 className="font-semibold text-dark-800 flex items-center gap-2">
          <FileText size={16} className="text-blue-600" />
          Exportación de Permisos
        </h3>
        <p className="text-sm text-dark-500">
          CSV compatible con Excel. Incluye BOM para caracteres especiales en español.
        </p>

        {/* Filtros CSV */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-dark-600 mb-1">Desde</label>
            <input type="date" value={filtrosCSV.fecha_inicio}
              onChange={e => setFiltrosCSV(p => ({ ...p, fecha_inicio: e.target.value }))}
              className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs text-dark-600 mb-1">Hasta</label>
            <input type="date" value={filtrosCSV.fecha_fin}
              onChange={e => setFiltrosCSV(p => ({ ...p, fecha_fin: e.target.value }))}
              className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-xs text-dark-600 mb-1">Estado</label>
            <select value={filtrosCSV.estado}
              onChange={e => setFiltrosCSV(p => ({ ...p, estado: e.target.value }))}
              className="input-field text-sm">
              <option value="">Todos</option>
              {['pendiente','pre_aprobado','aprobado','rechazado'].map(s => (
                <option key={s} value={s}>{s.replace('_',' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-dark-600 mb-1">Sector</label>
            <select value={filtrosCSV.sector}
              onChange={e => setFiltrosCSV(p => ({ ...p, sector: e.target.value }))}
              className="input-field text-sm">
              <option value="">Todos</option>
              {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <BtnDescarga
          onClick={() => descargar(
            `/reportes/exportar/permisos${buildQuery(filtrosCSV)}`,
            `permisos_${new Date().toISOString().split('T')[0]}.csv`
          )}
          nombre="Exportar Permisos"
          desc="Con los filtros seleccionados arriba"
          ext=".csv"
          color="bg-blue-600 hover:bg-blue-700"
        />
      </div>

      <div className="rounded-xl bg-dark-50 border border-dark-200 p-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={15} className="text-dark-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-dark-500">
            Los archivos Excel (.xlsx) se abren directamente en Microsoft Excel o LibreOffice Calc.
            Los archivos CSV incluyen separador punto y coma (;) y codificación UTF-8 para compatibilidad con Excel en español.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function Reportes() {
  const { esAdmin, esSupervisor } = useAuth();
  const [tab,  setTab]  = useState('dashboard');
  const [anio, setAnio] = useState(new Date().getFullYear());

  if (!esAdmin && !esSupervisor) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center">
          <XCircle size={40} className="mx-auto mb-3 text-red-400" />
          <p className="text-dark-600 font-medium">Acceso restringido a supervisores y administradores</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-900">Reportes Institucionales</h1>
          <p className="text-dark-500 text-sm mt-0.5">CESFAM Los Cerros — RRHH y Dirección</p>
        </div>
        <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="input-field w-28 text-sm font-semibold">
          {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-100 p-1 rounded-xl w-fit">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-dark-900 shadow-sm'
                : 'text-dark-500 hover:text-dark-700'
            }`}>
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div>
        {tab === 'dashboard'  && <TabDashboard anio={anio} />}
        {tab === 'permisos'   && <TabPermisos />}
        {tab === 'ausentismo' && <TabAusentismo />}
        {tab === 'ejecutivos' && <TabEjecutivos />}
        {tab === 'exportar'   && <TabExportar anio={anio} />}
      </div>
    </div>
  );
}
