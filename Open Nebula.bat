@echo off
cd /d "%~dp0"
set "EXE="
for /f "delims=" %%f in ('dir /b /o-d "release\Nebula-portable-*.exe" 2^>nul') do if not defined EXE set "EXE=%%f"
if not defined EXE echo No portable build in release\. Run: npm run pack:win & pause & exit /b 1
start "" "%~dp0release\%EXE%"
