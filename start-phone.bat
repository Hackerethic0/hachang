@echo off
cd /d "%~dp0"
echo.
echo  Phone test mode: the server accepts connections from your Wi-Fi network.
echo  Look for the line "http://192.168.x.x:3000" below and open it on the phone.
echo  If Windows Firewall asks, click Allow access (Private networks).
echo.
set "HOST=0.0.0.0"
call start.bat
