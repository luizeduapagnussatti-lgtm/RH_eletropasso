@echo off
setlocal
cd /d "%~dp0"
REM Preflight LAN (ARP/TCP) em PowerShell 64-bit — nao depende do WatchComm x86.
"%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\Ensure-PrintPointLink.ps1" -ClockIp 192.168.15.201 -ClockPort 3000 -MacAddress f8-f0-05-65-80-11
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-WatchCommPoller.ps1" -ConfigPath "%~dp0config.json"
exit /b %ERRORLEVEL%
