import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Política de tratamiento de datos personales (Ley 19.628, modificada por la
// Ley 21.719). Pública: se enlaza desde el inicio de sesión y desde el menú.
const ACTUALIZADA = '30 de octubre de 2026';

function Seccion({ titulo, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-dark-900">{titulo}</h2>
      <div className="text-sm text-dark-600 leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export default function Privacidad() {
  const { usuario } = useAuth();
  return (
    <div className="min-h-screen bg-dark-50 py-8 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-dark-200 shadow-card p-6 sm:p-8 space-y-6">
        <Link to={usuario ? '/mis-datos' : '/login'} className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
          <ArrowLeft size={15} /> {usuario ? 'Volver a mis datos' : 'Volver al inicio de sesión'}
        </Link>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Shield size={20} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-dark-900">Política de privacidad y protección de datos personales</h1>
            <p className="text-xs text-dark-400 mt-1">Sistema de Gestión de Permisos · Actualizada el {ACTUALIZADA}</p>
          </div>
        </div>

        <Seccion titulo="1. Responsable del tratamiento">
          <p>
            Dirección de Administración de Salud de Talcahuano (DAS), Bulnes 266, 3er piso, Talcahuano.
            Teléfono 41 383 5700. Las consultas y solicitudes sobre sus datos se reciben en la sección
            <strong> Mis datos personales</strong> del sistema o en la Unidad de Personal (RRHH).
          </p>
        </Seccion>

        <Seccion titulo="2. Para qué se usan sus datos">
          <p>
            Para la gestión de personal de los establecimientos de la DAS: solicitud, aprobación y registro de
            feriados, permisos administrativos y especiales, descansos compensatorios, licencias médicas,
            cometidos y comisiones de servicio, suplencias, control de saldos y la firma electrónica de los
            formularios. No se usan para otros fines ni para decisiones automatizadas.
          </p>
        </Seccion>

        <Seccion titulo="3. Base legal">
          <p>
            El tratamiento lo realiza un órgano público dentro de sus funciones legales (artículo 20 de la
            Ley N° 19.628, modificada por la Ley N° 21.719), en cumplimiento del Estatuto de Atención Primaria
            de Salud Municipal (Ley N° 19.378) y de la normativa municipal y laboral aplicable. Por eso no se
            requiere su consentimiento para los fines indicados.
          </p>
        </Seccion>

        <Seccion titulo="4. Qué datos se tratan">
          <ul className="list-disc pl-5 space-y-1">
            <li>Identificación: nombre, RUT, sexo, fecha de nacimiento, fotografía y firma.</li>
            <li>Contacto: correo institucional, teléfono y dirección particular.</li>
            <li>Laborales: cargo, estamento, contrato, jornada, establecimiento, sector, fecha de ingreso y saldos.</li>
            <li>Solicitudes: permisos, feriados, compensatorios, cometidos, suplencias y su historial.</li>
            <li>
              <strong>Datos sensibles de salud:</strong> licencias médicas (fechas, folio y entidad emisora; no se
              registra el diagnóstico). Solo los ven el titular y el personal de RRHH que las gestiona.
            </li>
            <li>Seguridad: inicios de sesión y consultas a datos de otros funcionarios (registro de accesos).</li>
          </ul>
        </Seccion>

        <Seccion titulo="5. Quién accede a sus datos">
          <p>
            Solo personal autorizado, según su función: la jefatura directa ve a los funcionarios de su sector o
            unidad; RRHH, Secretaría y Dirección, lo necesario para tramitar las solicitudes. No se entregan a
            terceros salvo obligación legal (por ejemplo, requerimientos de Contraloría o de tribunales).
          </p>
          <p>
            El sistema se aloja en proveedores de servicios en la nube (Supabase, Render y Vercel), que actúan
            como encargados del tratamiento por cuenta de la DAS. Sus servidores están en Estados Unidos, por lo
            que existe una transferencia internacional de datos, protegida con conexiones cifradas y acceso
            restringido.
          </p>
        </Seccion>

        <Seccion titulo="6. Cuánto tiempo se conservan">
          <p>
            Mientras dure su relación con la DAS y, después, por los plazos que la normativa exige conservar los
            antecedentes de personal. Cumplidos esos plazos, se eliminan o anonimizan.
          </p>
        </Seccion>

        <Seccion titulo="7. Medidas de seguridad">
          <ul className="list-disc pl-5 space-y-1">
            <li>Acceso con usuario y contraseña personal, cifrada; cambio obligatorio de la contraseña inicial.</li>
            <li>Bloqueo de la cuenta tras 5 intentos fallidos y cierre de sesión tras 30 minutos sin actividad.</li>
            <li>Permisos por rol y por sector: cada persona ve solo lo que su función requiere.</li>
            <li>Registro de quién consulta fichas, licencias médicas y formularios de otros funcionarios.</li>
            <li>Comunicación cifrada (HTTPS) entre su equipo y el sistema.</li>
          </ul>
        </Seccion>

        <Seccion titulo="8. Sus derechos">
          <p>Usted puede ejercer, sin costo, los siguientes derechos:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Acceso:</strong> saber qué datos suyos se tratan, para qué y quién los ha consultado.</li>
            <li><strong>Rectificación:</strong> corregir datos inexactos, desactualizados o incompletos.</li>
            <li><strong>Supresión:</strong> pedir que se eliminen los datos que ya no sean necesarios.</li>
            <li><strong>Oposición:</strong> oponerse a un tratamiento determinado.</li>
            <li><strong>Portabilidad:</strong> recibir sus datos en un formato estructurado (descarga en "Mis datos").</li>
            <li><strong>Bloqueo:</strong> suspender temporalmente el tratamiento mientras se resuelve su solicitud.</li>
          </ul>
          <p>
            Puede ejercerlos en <strong>Mis datos personales</strong> dentro del sistema o en la Unidad de
            Personal. La DAS responde dentro de 30 días corridos, prorrogables por una vez. Si no queda conforme,
            puede reclamar ante la Agencia de Protección de Datos Personales. Algunos derechos pueden limitarse
            cuando la ley obliga a conservar los datos (por ejemplo, antecedentes de remuneraciones o permisos).
          </p>
        </Seccion>
      </div>
    </div>
  );
}
