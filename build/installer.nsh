; Centrio — custom steps for the electron-builder NSIS installer (picked up from build/installer.nsh).
;
; 3.7.4 «Удалил программу»: when a person really removes Centrio (not an update — the old uninstaller also runs
; on every update with --updated, see ${isUpdated}), tell the server which install went away. The app keeps its
; anonymous install id in %APPDATA%\Centrio\uninstall-id.json (main/services/uninstallMark.js); nothing else is
; sent. A hidden PowerShell call with a 6 second limit; any failure (offline, no file) is ignored and never blocks
; the uninstall. $$ is a literal $ for PowerShell.

!macro customUnInstall
  ${ifNot} ${isUpdated}
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $$f = Join-Path $$env:APPDATA 'Centrio\uninstall-id.json'; if (Test-Path -LiteralPath $$f) { $$b = [IO.File]::ReadAllText($$f); Invoke-RestMethod -Uri 'https://api.centrio.me/api/visitors/uninstalled' -Method Post -ContentType 'application/json' -Body $$b -TimeoutSec 6 | Out-Null } } catch {}"`
    Pop $0
  ${endIf}
!macroend
