Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "c:\Projects\PhotoNitis"
WshShell.Run "cmd.exe /c npm start", 0, false
