@echo off
cd /d "%~dp0"

echo ========================================
echo   Debug Mode
echo ========================================
echo.

echo [1] Current Directory:
cd
echo.

echo [2] Node.js Version:
node -v
echo.

echo [3] NPM Version:
npm -v
echo.

echo [4] package.json:
if exist "package.json" (echo EXISTS) else (echo NOT FOUND)
echo.

echo [5] node_modules:
if exist "node_modules" (echo EXISTS) else (echo NOT FOUND)
echo.

echo ========================================
echo Press any key to exit...
pause >nul
