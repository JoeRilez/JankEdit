@echo off
cd /d "%~dp0"
start "JankEdit Vite" cmd /c "npm run dev:vite"
timeout /t 4 /nobreak >nul
node node_modules\electron\dist\electron.exe .
