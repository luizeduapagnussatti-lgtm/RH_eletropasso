@echo off
cd /d "C:\xampp\htdocs\RH_eletropasso\scripts\dmprep-agent"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\xampp\htdocs\RH_eletropasso\scripts\dmprep-agent\Sync-DmprepPunches.ps1" -ConfigPath "C:\xampp\htdocs\RH_eletropasso\scripts\dmprep-agent\config.from-server.json"
