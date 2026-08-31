' MedPronto - verifica, corrige se precisar e abre o sistema (padrao Estnovo)

Option Explicit

Dim shell, fso, projDir, ps1, q, cmd, clickLog, tf

Set shell = CreateObject("WScript.Shell")
Set fso   = CreateObject("Scripting.FileSystemObject")
q = Chr(34)

projDir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = projDir & "\scripts\medpronto_launcher.ps1"

On Error Resume Next
clickLog = projDir & "\data\clique-vbs.log"
If Not fso.FolderExists(projDir & "\data") Then
    fso.CreateFolder projDir & "\data"
End If
Set tf = fso.OpenTextFile(clickLog, 8, True)
tf.WriteLine Now & " | " & WScript.ScriptFullName
tf.Close
On Error GoTo 0

If Not fso.FileExists(ps1) Then
    MsgBox "Nao encontrei o launcher em:" & vbCrLf & ps1, vbCritical, "MedPronto"
    WScript.Quit 1
End If

shell.CurrentDirectory = projDir

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & q & ps1 & q & " -Silent -Root " & q & projDir & q
shell.Run cmd, 0, False
WScript.Quit 0
