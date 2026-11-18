Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

repoDir = FSO.GetParentFolderName(FSO.GetParentFolderName(WScript.ScriptFullName))
enginePath = FSO.BuildPath(repoDir, "localization_engine.js")

argsStr = ""
For i = 0 To WScript.Arguments.Count - 1
    arg = Replace(WScript.Arguments(i), """", """""")
    argsStr = argsStr & " """ & arg & """"
Next

cmd = "node """ & enginePath & """ --launch" & argsStr
WshShell.Run cmd, 0, False
