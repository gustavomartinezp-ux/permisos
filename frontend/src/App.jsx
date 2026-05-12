import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Funcionarios from './pages/Funcionarios';
import FuncionarioDetalle from './pages/FuncionarioDetalle';
import Solicitudes from './pages/Solicitudes';
import Historial from './pages/Historial';
import TiposPermisos from './pages/TiposPermisos';
import Configuracion from './pages/Configuracion';

// Redirige según rol al entrar a la app
function HomeRedirect() {
  const { usuario } = useAuth();
  if (usuario?.rol === 'funcionario' && usuario?.funcionario_id) {
    return <Navigate to={`/funcionarios/${usuario.funcionario_id}`} replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

// Bloquea una ruta si el rol es funcionario
function SoloSupervisor({ children }) {
  const { usuario, cargando, esFuncionario } = useAuth();
  if (cargando) return null;
  if (!usuario) return <Navigate to="/login" replace />;
  if (esFuncionario) {
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
        <Route path="/dashboard"    element={<SoloSupervisor><Dashboard /></SoloSupervisor>} />
        <Route path="/funcionarios" element={<SoloSupervisor><Funcionarios /></SoloSupervisor>} />
        <Route path="/configuracion" element={<SoloSupervisor><Configuracion /></SoloSupervisor>} />
        <Route path="/tipos-permisos" element={<SoloSupervisor><TiposPermisos /></SoloSupervisor>} />

        {/* Accesibles a todos (backend filtra por funcionario_id) */}
        <Route path="/funcionarios/:id" element={<FuncionarioDetalle />} />
        <Route path="/solicitudes"      element={<Solicitudes />} />
        <Route path="/historial"        element={<Historial />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
