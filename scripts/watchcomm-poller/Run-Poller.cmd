@echo off
setlocal
cd /d "%~dp0"
"%WINDIR%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-WatchCommPoller.ps1" -ConfigPath "%~dp0config.json"
exit /b %ERRORLEVEL%
