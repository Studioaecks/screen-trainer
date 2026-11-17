# Screen Trainer - Mewtwo asks Windows: its version, a pending restart, the last installed update, the updates that are waiting.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file> [-Online]
# Without -Online it uses what Windows Update already knows (quick); with it, Windows Update looks on the internet (slow).
# It only reads, and prints one line of JSON as its last line. Each part has its own try/catch, so one part that
# Windows refuses does not lose the others. Keep this file plain ASCII (Windows PowerShell reads files without a
# BOM as ANSI), and keep every name guardian.js reads (readSecurity, readUpdates, readSystem and advise() there).
param([switch]$Online)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$o = [ordered]@{}

try {
  $os = Get-CimInstance Win32_OperatingSystem
  $o.os = [ordered]@{ name = "$($os.Caption)"; version = "$($os.Version)"; build = "$($os.BuildNumber)"; boot = $os.LastBootUpTime.ToString('s') }
} catch { $o.osError = "$($_.Exception.Message)" }

try {
  $o.reboot = ((Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') -or
               (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'))
} catch { }

try {
  $h = Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
  if ($h) { $o.lastPatch = [ordered]@{ id = "$($h.HotFixID)"; on = $h.InstalledOn.ToString('s') } }
} catch { }

try {
  $session = New-Object -ComObject Microsoft.Update.Session
  $searcher = $session.CreateUpdateSearcher()
  $searcher.Online = [bool]$Online
  $found = $searcher.Search('IsInstalled=0 and IsHidden=0')
  $o.pending = @($found.Updates | ForEach-Object { [ordered]@{ title = "$($_.Title)"; downloaded = [bool]$_.IsDownloaded } })
} catch { $o.pendingError = "$($_.Exception.Message)" }

$o | ConvertTo-Json -Depth 4 -Compress
