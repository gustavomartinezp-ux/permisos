@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"

echo.
echo  =============================================
echo   CESFAM Los Cerros - Iniciando sistema...
echo  =============================================
echo.

REM Verificar que existe backend\.env
if not exist "%ROOT%backend\.env" (
    echo [ERROR] No se encontro backend\.env
    echo Copia template.env a backend\.env y completa los valores.
    echo.
    pause
    exit /b 1
)

REM Liberar puertos en uso
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3001" ^| find "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Levantar base de datos local si existe docker-compose.yml
if exist "%ROOT%docker-compose.yml" (
    echo [1/3] Levantando base de datos (Docker)...
    docker-compose -f "%ROOT%docker-compose.yml" up -d
    if !errorlevel! neq 0 (
        echo [AVISO] Docker no disponible o ya estaba corriendo. Continuando...
    )
    timeout /t 3 >nul
    echo.
)

echo [2/3] Iniciando backend en puerto 3001...
start "Backend CESFAM" cmd /k "cd /d "%ROOT%backend" && npm run dev"
timeout /t 3 >nul

echo [3/3] Iniciando frontend en puerto 5173...
start "Frontend CESFAM" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo.
echo  Abriendo navegador en 5 segundos...
timeout /t 5 >nul
start http://localhost:5173
