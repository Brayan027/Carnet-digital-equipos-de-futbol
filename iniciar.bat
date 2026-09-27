@echo off
title Sistema de Torneo de Futbol - Carnets y Verificacion QR
echo ==================================================================
echo   Iniciando Sistema de Carnets de Futbol y Verificacion QR
echo ==================================================================
echo.

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] No se encontro Node.js instalado en el sistema.
    echo Por favor instala Node.js para ejecutar el servidor y la base de datos.
    pause
    exit /b
)

echo Iniciando servidor en segundo plano...
start "Servidor Futbol" node server.js

timeout /t 2 /nobreak >nul
echo Abriendo aplicacion en el navegador...
start http://localhost:3050

echo.
echo ==================================================================
echo   El servidor esta corriendo en http://localhost:3050
echo   Para conectar tu celular por Wi-Fi, revisa la ventana del servidor
echo   y abre el enlace con la IP que muestra la consola.
echo ==================================================================
echo.
pause
