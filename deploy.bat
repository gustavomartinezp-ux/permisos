@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"

echo ============================================
echo   DEPLOY CESFAM Los Cerros a Google Cloud
echo ============================================
echo.

REM ── Verificar y cargar backend\.env ─────────────────────────
if not exist "%ROOT%backend\.env" (
    echo [ERROR] No se encontro backend\.env
    echo Copia template.env a backend\.env y completa los valores.
    pause
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%backend\.env") do (
    set "_k=%%A"
    if not "!_k:~0,1!"=="#" if not "!_k!"=="" if not "%%B"=="" (
        set "%%A=%%B"
    )
)

if "%DATABASE_URL%"=="" (
    echo [ERROR] DATABASE_URL no definida en backend\.env
    pause
    exit /b 1
)
if "%JWT_SECRET%"=="" (
    echo [ERROR] JWT_SECRET no definida en backend\.env
    pause
    exit /b 1
)

REM ── Solicitar datos del proyecto ─────────────────────────────
set /p PROJECT_ID="Google Cloud Project ID: "
set /p BACKEND_URL="URL del backend en Cloud Run (vacio para primer deploy): "

if "%BACKEND_URL%"=="" goto :deploy_backend
goto :deploy_frontend

REM ── PASO 1: Backend en Cloud Run ─────────────────────────────
:deploy_backend
echo.
echo === PASO 1: Desplegando backend en Cloud Run ===
cd /d "%ROOT%backend"

gcloud config set project %PROJECT_ID%
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

gcloud run deploy cesfam-backend ^
  --source . ^
  --region us-central1 ^
  --allow-unauthenticated ^
  --set-env-vars DATABASE_URL="%DATABASE_URL%" ^
  --set-env-vars JWT_SECRET="%JWT_SECRET%" ^
  --set-env-vars NODE_ENV="production" ^
  --set-env-vars FRONTEND_URL="https://placeholder.web.app"

echo.
echo IMPORTANTE: Copia la URL del backend que aparece arriba.
echo Vuelve a ejecutar este script e ingrésala cuando se pida.
pause
exit /b 0

REM ── PASO 2: Frontend en Firebase ─────────────────────────────
:deploy_frontend
echo.
echo === PASO 2: Compilando y desplegando frontend en Firebase ===
cd /d "%ROOT%frontend"

set VITE_API_URL=%BACKEND_URL%/api
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion del frontend
    pause
    exit /b 1
)

call firebase use %PROJECT_ID%
call firebase deploy --only hosting 2>&1 | tee "%ROOT%firebase_deploy.log"

REM ── PASO 3: Capturar URL de Firebase y actualizar CORS ───────
echo.
echo === PASO 3: Actualizando CORS del backend ===

REM Intentar extraer la URL del log de deploy
set FIREBASE_URL=
for /f "tokens=*" %%i in ('findstr /i "Hosting URL" "%ROOT%firebase_deploy.log" 2^>nul') do (
    for /f "tokens=3" %%j in ("%%i") do set FIREBASE_URL=%%j
)

REM Si no se pudo detectar, pedir al usuario
if "%FIREBASE_URL%"=="" (
    echo No se pudo detectar la URL de Firebase automaticamente.
    set /p FIREBASE_URL="Ingresa la URL de Firebase Hosting (ej: https://proyecto.web.app): "
)

del "%ROOT%firebase_deploy.log" >nul 2>&1

echo Configurando FRONTEND_URL=%FIREBASE_URL%...
gcloud run services update cesfam-backend ^
  --region us-central1 ^
  --update-env-vars FRONTEND_URL="%FIREBASE_URL%"

echo.
echo ============================================
echo   Deploy completado exitosamente
echo   Backend:  %BACKEND_URL%
echo   Frontend: %FIREBASE_URL%
echo ============================================
pause
