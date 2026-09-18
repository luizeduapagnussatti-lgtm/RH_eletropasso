' Inicia o supervisor do frontend (Watch-Frontend.ps1) sem janela de console.
' Uso: wscript.exe "C:\xampp\htdocs\RH_eletropasso\scripts\Run-WatchFrontend.vbs"
'      (também usado por start-rh.ps1)

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Preferir cópia em E:\ (deploy) se existir; senão o repo.
ps1 = "E:\RH_eletropasso\scripts\Watch-Frontend.ps1"
If Not fso.FileExists(ps1) Then
  ps1 = scriptDir & "\Watch-Frontend.ps1"
End If

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ -IntervalSec 30"
' 0 = oculto, False = não esperar
shell.Run cmd, 0, False
