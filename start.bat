@echo off
cd /d "%~dp0"

echo Freeing port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5174 "') do taskkill /f /pid %%a >nul 2>&1

echo Starting JankEdit...
start "JankEdit Vite" cmd /c "npm run dev:vite"
timeout /t 4 /nobreak >nul
node node_modules\electron\dist\electron.exe .
