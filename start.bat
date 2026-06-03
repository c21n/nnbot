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
echo ========================================
echo.

call npm run dev

echo.
echo ========================================
echo Bot stopped.
pause
