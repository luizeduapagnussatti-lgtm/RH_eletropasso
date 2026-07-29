' Executa um .ps1 sem nenhuma janela de console (Task Scheduler / atalhos).
' Uso:
'   wscript.exe //nologo "E:\RH_eletropasso\scripts\Run-HiddenPs1.vbs" "E:\RH_eletropasso\scripts\Ensure-Frontend.ps1" -Mode preview
'
' shell.Run style 0 = oculto (mais confiável que powershell -WindowStyle Hidden no Scheduler).
' WaitOnReturn True = a tarefa espera o script e herda o código de saída.

Option Explicit
Dim shell, fso, ps1, i, extra, cmd, exitCode

If WScript.Arguments.Count < 1 Then
  WScript.Quit 1
End If

Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

ps1 = WScript.Arguments(0)
If Not fso.FileExists(ps1) Then
  WScript.Quit 2
End If

extra = ""
For i = 1 To WScript.Arguments.Count - 1
  extra = extra & " " & WScript.Arguments(i)
Next

cmd = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """" & extra
exitCode = shell.Run(cmd, 0, True)
WScript.Quit exitCode
