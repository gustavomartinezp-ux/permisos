@echo off
setlocal
set "ROOT=%~dp0"

if not exist "%ROOT%backend\.env" (
    echo [ERROR] No se encontro backend\.env
    echo Copia template.env a backend\.env y completa DATABASE_URL.
    pause
    exit /b 1
)

echo Probando conexion a la base de datos...
cd /d "%ROOT%backend"
node -e "require('dotenv').config(); const {Pool}=require('pg'); const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); p.query('SELECT NOW() as hora').then(r=>{console.log('[OK] Conexion exitosa:', r.rows[0].hora); p.end();}).catch(e=>{console.log('[ERROR]', e.message); p.end()});"
pause
