@echo off
cd /d "%~dp0"
echo === Nebula, development ===
echo.
echo Runs from source with hot reload, on its own profile:
echo   %~dp0.dev-profile
echo.
echo The installed Nebula and its notes are NOT touched.
echo Close this window to stop it.
echo.
call npm run dev
echo.
echo Dev server stopped.
pause
