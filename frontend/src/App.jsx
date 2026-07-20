import { Component } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturó:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-dark-50 p-6">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-4">
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-semibold text-dark-900">Ocurrió un error inesperado</h1>
            <p className="text-sm text-dark-500">
              {this.state.error?.message || 'Error desconocido'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-6 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Funcionarios from './pages/Funcionarios';
import FuncionarioDetalle from './pages/FuncionarioDetalle';
import Solicitudes from './pages/Solicitudes';
import Historial from './pages/Historial';
import TiposPermisos from './pages/TiposPermisos';
import Configuracion from './pages/Configuracion';
import HorasCompensatorias from './pages/HorasCompensatorias';
import Reportes from './pages/Reportes';
import Suplencias from './pages/Suplencias';
import AcercaDel from './pages/AcercaDel';
import RolesPermisos from './pages/RolesPermisos';

// Redirige según rol al entrar a la app
function HomeRedirect() {
  const { usuario } = useAuth();
  if (usuario?.rol === 'funcionario' && usuario?.funcionario_id) {
    return <Navigate to={`/funcionarios/${usuario.funcionario_id}`} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

// Bloquea una ruta si el rol es funcionario raso — no aplica a roles RBAC nuevos
// (SECRETARY, AUDITOR) que conviven con rol legacy 'funcionario' pero sí deben
// acceder a estas secciones.
function SoloSupervisor({ children }) {
  const { usuario, cargando, esSoloAutoservicio } = useAuth();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (esSoloAutoservicio) {
    return <Navigate to={`/funcionarios/${usuario.funcionario_id}`} replace />;
  }
  return children;
}

function ProtectedRoute({ children, requiereAdmin }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  if (!usuario) return <Navigate to="/login" replace />;
  if (requiereAdmin && usuario.rol !== 'admin') return <Navigate to="/dashboard" replace />;

  return children;
}

function AppRoutes() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={usuario ? <HomeRedirect /> : <Login />} />
      <Route path="/" element={<HomeRedirect />} />

      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        {/* Solo supervisores/admin */}
        <Route path="/dashboard"      element={<SoloSupervisor><Dashboard /></SoloSupervisor>} />
        <Route path="/configuracion"  element={<SoloSupervisor><Configuracion /></SoloSupervisor>} />
        <Route path="/tipos-permisos" element={<SoloSupervisor><TiposPermisos /></SoloSupervisor>} />

        {/* Accesibles a todos (backend filtra por funcionario_id) */}
        <Route path="/reportes"   element={<SoloSupervisor><Reportes /></SoloSupervisor>} />
        <Route path="/suplencias" element={<SoloSupervisor><Suplencias /></SoloSupervisor>} />

        {/* Grupos contractuales — segmentación estricta por calidad jurídica */}
        <Route path="/funcionarios" element={<SoloSupervisor><Funcionarios grupo="contrata"   /></SoloSupervisor>} />
        <Route path="/honorarios"   element={<SoloSupervisor><Funcionarios grupo="honorarios" /></SoloSupervisor>} />
        <Route path="/suplentes"    element={<SoloSupervisor><Funcionarios grupo="suplentes"  /></SoloSupervisor>} />

        {/* Accesibles a todos (backend filtra por funcionario_id) */}
        <Route path="/funcionarios/:id"        element={<FuncionarioDetalle />} />
        <Route path="/solicitudes"             element={<Solicitudes />} />
        <Route path="/horas-compensatorias"    element={<HorasCompensatorias />} />
        <Route path="/historial"               element={<Historial />} />
        <Route path="/roles"                   element={<SoloSupervisor><RolesPermisos /></SoloSupervisor>} />
        <Route path="/acerca"                  element={<AcercaDel />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
