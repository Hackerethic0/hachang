@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
set "NEED=0"
where node >nul 2>nul
if errorlevel 1 set "NEED=1"
if "%NEED%"=="0" call :checkver
if "%NEED%"=="0" goto run
if exist "%~dp0runtime\node\node.exe" goto usebundled
echo.
echo Node.js 22.13 or newer was not found on this computer.
echo This program can download a portable copy, about 30 MB, into the runtime folder.
echo No installation and no administrator rights are needed.
echo.
choice /c YN /m "Download now"
if errorlevel 2 goto manual
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-node.ps1"
if errorlevel 1 goto dlfail
:usebundled
if not exist "%~dp0runtime\node\node.exe" goto dlfail
set "NODE_EXE=%~dp0runtime\node\node.exe"
:run
set "OPEN_BROWSER=1"
"%NODE_EXE%" --disable-warning=ExperimentalWarning server-lite.js
echo.
echo The server stopped. Please read the message above.
pause
exit /b 1
:manual
echo.
echo Install Node.js yourself from https://nodejs.org , choose the LTS version, then run this file again.
pause
exit /b 1
:dlfail
echo.
echo Download failed. Check your internet connection, or install Node.js from https://nodejs.org then run this file again.
pause
exit /b 1
:checkver
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)" >nul 2>nul
if errorlevel 1 set "NEED=1"
goto :eof
