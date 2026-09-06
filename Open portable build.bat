@echo off
cd /d "%~dp0"
echo === Nebula, portable build ===
echo.
echo Launches the newest release\Nebula-portable-*.exe.
echo A portable build keeps its notes beside itself:
echo   %~dp0release\Nebula-data
echo.
echo It is a third, separate vault - not the installed app's notes,
echo not the dev profile. Run "npm run pack:win" to rebuild it.
echo.
set "EXE="
for /f "delims=" %%f in ('dir /b /o-d "release\Nebula-portable-*.exe" 2^>nul') do if not defined EXE set "EXE=%%f"
if not defined EXE echo No portable build in release\. Run: npm run pack:win & pause & exit /b 1
echo Starting %EXE% ...
start "" "%~dp0release\%EXE%"
