# CESFAM Los Cerros — Sistema de Gestión de Permisos

Sistema web de RR.HH. con **contabilidad de tiempos** y descuento automático de días mediante transacciones atómicas.

## Arquitectura

```
Frontend (React + Vite)     →    Backend (Node.js + Express)    →    PostgreSQL
  Puerto: 5173                     Puerto: 3001                       Puerto: 5432
```

### Motor de Transacciones (Opción B: Backend Logic)
Cuando se aprueba un permiso, el servidor ejecuta una **transacción atómica** que:
1. Verifica saldo disponible
2. Descuenta días (`dias_usados += N`)
3. Libera la reserva pendiente (`dias_pendientes -= N`)
4. Registra en `historial_movimientos` con saldo anterior y nuevo

Si cualquier paso falla → `ROLLBACK` completo. Imposible dejar el sistema en estado inconsistente.

## Requisitos previos

- **Node.js** 18+ — https://nodejs.org
- **Docker Desktop** — https://www.docker.com/products/docker-desktop

## Instalación rápida (Windows)

```bat
# 1. Instalar dependencias
instalar.bat

# 2. Iniciar todo el sistema
iniciar.bat
```

O manualmente:

```bat
# Terminal 1 — Base de datos
docker-compose up -d

# Terminal 2 — Backend
cd backend
npm install
npm run dev

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```

Abre el navegador en: **http://localhost:5173**

## Cuentas de prueba

| Rol | Email | Contraseña |
|-----|-------|-----------|
| Admin | admin@cesfam.cl | password |
| Supervisor | supervisor@cesfam.cl | password |
| Funcionario | maria.gonzalez@cesfam.cl | password |

## Funcionalidades

### Dashboard
- Estadísticas en tiempo real: funcionarios, solicitudes pendientes, aprobadas, rechazadas
- Panel de aprobación rápida directamente desde el dashboard
- Próximas ausencias (7 días)
- Ranking de uso de días
- Actividad reciente

### Funcionarios
- Listado con saldos disponibles por tipo de permiso
- Barra de progreso de uso anual
- Vista de detalle con 3 pestañas:
  - **Saldos**: Tarjetas con barras de progreso animadas
  - **Historial**: Línea de tiempo con todos los movimientos
  - **Solicitudes**: Lista de permisos con estado

### Solicitudes
- Registro con validación de saldo en tiempo real
- Filtros por estado (Pendiente / Aprobada / Rechazada)
- Aprobación/rechazo con transacción atómica
- Observaciones al rechazar

### Historial (Libro Mayor)
- Vista de **línea de tiempo** animada (Framer Motion)
- Vista de **tabla** para exportación
- Filtros por tipo de movimiento
- Cada entrada muestra: saldo anterior → saldo nuevo

## Estructura de base de datos

```
servicios              — Unidades del CESFAM
tipos_permisos         — Feriado, Admin, Matrimonio, etc.
funcionarios           — Personal activo
usuarios               — Cuentas con roles (admin/supervisor/funcionario)
saldos_funcionarios    — Saldo anual por funcionario y tipo (con constraint de integridad)
solicitudes            — Peticiones de permiso con estado
historial_movimientos  — TABLA PRINCIPAL: log inmutable de cada transacción
```

## Roles

| Rol | Capacidades |
|-----|-------------|
| `admin` | Todo: ver, crear, aprobar, rechazar, ajustar saldos |
| `supervisor` | Aprobar/rechazar solicitudes, ver todos los funcionarios |
| `funcionario` | Ver sus propios saldos e historial, crear solicitudes |

## Variables de entorno (backend/.env)

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cesfam_permisos
DB_USER=cesfam_admin
DB_PASSWORD=cesfam_2026_secure
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=8h
FRONTEND_URL=http://localhost:5173
```
