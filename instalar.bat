@echo off
setlocal
set "ROOT=%~dp0"

echo ============================================================
echo  CESFAM Los Cerros - Sistema de Permisos
echo  Script de instalacion de dependencias
echo ============================================================
echo.

REM Crear backend\.env si no existe
if not exist "%ROOT%backend\.env" (
    echo [AVISO] No se encontro backend\.env
    echo Creando desde template.env...
    copy "%ROOT%template.env" "%ROOT%backend\.env" >nul
    echo IMPORTANTE: Edita backend\.env y completa DATABASE_URL y JWT_SECRET antes de iniciar.
    echo.
)

echo [1/3] Instalando dependencias del backend...
cd /d "%ROOT%backend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo la instalacion del backend
    pause
    exit /b 1
)
echo  Backend OK
echo.

echo [2/3] Instalando dependencias del frontend...
cd /d "%ROOT%frontend"
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Fallo la instalacion del frontend
    pause
    exit /b 1
)
echo  Frontend OK
echo.

echo [3/3] Instalacion completa.
echo.
echo Proximos pasos:
echo   1. Edita backend\.env con tus credenciales (si no lo has hecho)
echo   2. Ejecuta iniciar.bat  (levanta Docker + backend + frontend)
echo.
pause
