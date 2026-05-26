@echo off
cd /d "%~dp0"

echo Freeing port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 "') do taskkill /f /pid %%a >nul 2>&1

echo Starting Vite...
start "JankEdit - Vite" cmd /k "npm run dev:vite"

echo Waiting for Vite...
timeout /t 5 /nobreak >nul

echo Starting Electron...
"node_modules\electron\dist\electron.exe" .
