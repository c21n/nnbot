@echo off
cd /d "%~dp0"
title NNBot

echo ========================================
echo   NNBot
echo ========================================
echo.

if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

echo [INFO] Starting Bot...
echo [INFO] WebUI will open at http://localhost:8080
echo ========================================
echo.

:: Open WebUI in browser after 3 second delay
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8080"

call npm run dev

echo.
echo ========================================
echo Bot stopped.
pause
