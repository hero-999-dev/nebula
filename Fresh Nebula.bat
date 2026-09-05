@echo off
cd /d "%~dp0"
echo === Nebula: reset DEV notes + rebuild ===
echo (the installed Nebula's notes are not touched)
call npm run fresh
if errorlevel 1 echo. & echo Build FAILED - nothing was replaced. & pause & exit /b 1
set "EXE="
for /f "delims=" %%f in ('dir /b /o-d "release\Nebula-portable-*.exe" 2^>nul') do if not defined EXE set "EXE=%%f"
if not defined EXE echo Build finished but no portable exe found in release\. & pause & exit /b 1
echo.
echo Done. Launching %EXE% ...
start "" "%~dp0release\%EXE%"
