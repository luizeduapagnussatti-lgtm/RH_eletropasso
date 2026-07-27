@echo off
cd /d "C:\RH_eletropasso\dmprep-agent"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\RH_eletropasso\dmprep-agent\Install-DmprepAgent.ps1" -InstallRoot "C:\RH_eletropasso\dmprep-agent" -SourceDir "C:\RH_eletropasso\dmprep-agent"
