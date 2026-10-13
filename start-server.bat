@echo off
setlocal
cd /d "%~dp0"
echo ========================================
echo       KOKAB BITES WEBSITE SERVER
echo ========================================
echo Enter a private admin password for this run.
echo Password must be remembered; it is not saved to disk.
set /p "ADMIN_PASSWORD=Admin password: "
if "%ADMIN_PASSWORD%"=="" (
  echo.
  echo ERROR: Password cannot be empty.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed or is not in PATH. Install Node.js 18 or newer.
  pause
  exit /b 1
)
echo.
echo Starting KOKAB BITES at http://localhost:3000
echo Admin dashboard: http://localhost:3000/admin.html
echo Keep this window open while using the website.
echo Press Ctrl+C to stop the server.
node server.js
if errorlevel 1 pause
endlocal
