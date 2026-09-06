@echo off
cd /d "%~dp0"
echo === Nebula, development: fresh notes ===
echo.
echo Resets ONLY the development profile:
echo   %~dp0.dev-profile
echo.
echo What it removes is copied to that profile's backups\ first.
echo The installed Nebula and its notes are NOT touched.
echo.
call npm run reset
if errorlevel 1 echo. & echo Reset failed - nothing was started. & pause & exit /b 1
echo.
echo Starting the dev app. Close this window to stop it.
echo.
call npm run dev
echo.
echo Dev server stopped.
pause
