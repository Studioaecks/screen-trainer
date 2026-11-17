# Screen Trainer - Mewtwo asks Windows: processor, graphics, drives, battery, what uses the most memory, startup programs, Game Mode.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# It only reads, and prints one line of JSON as its last line. Each part has its own try/catch, so one part that
# Windows refuses does not lose the others. Keep this file plain ASCII (Windows PowerShell reads files without a
# BOM as ANSI), and keep every name guardian.js reads (readSecurity, readUpdates, readSystem and advise() there).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$o = [ordered]@{}

try {
  $c = Get-CimInstance Win32_Processor | Select-Object -First 1
  $o.cpu = [ordered]@{ name = "$($c.Name)".Trim(); cores = [int]$c.NumberOfCores; threads = [int]$c.NumberOfLogicalProcessors; mhz = [int]$c.MaxClockSpeed }
} catch { }

try { $o.gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name)" }) } catch { }

try {
  $o.disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { [ordered]@{ id = "$($_.DeviceID)"; size = [double]$_.Size; free = [double]$_.FreeSpace } })
} catch { }

try {
  $b = Get-CimInstance Win32_Battery | Select-Object -First 1
  if ($b) { $o.battery = [ordered]@{ pct = [int]$b.EstimatedChargeRemaining; status = [int]$b.BatteryStatus } }
} catch { }

# the eight program names holding the most memory, all their processes added up
try {
  $o.top = @(Get-Process | Group-Object ProcessName | ForEach-Object {
      [ordered]@{ name = "$($_.Name)"; n = [int]$_.Count; mb = [math]::Round((($_.Group | Measure-Object WorkingSet64 -Sum).Sum) / 1MB) }
    } | Sort-Object { $_.mb } -Descending | Select-Object -First 8)
} catch { }

try {
  $o.startup = @(Get-CimInstance Win32_StartupCommand | ForEach-Object { [ordered]@{ name = "$($_.Name)"; where = "$($_.Location)" } })
} catch { }

# Game Mode: 1 on, 0 off, null when the value was never written (Windows then treats it as on)
try {
  $g = Get-ItemProperty -Path 'HKCU:\Software\Microsoft\GameBar' -Name AutoGameModeEnabled -ErrorAction SilentlyContinue
  $o.gameMode = $(if ($g -and $null -ne $g.AutoGameModeEnabled) { [int]$g.AutoGameModeEnabled } else { $null })
} catch { }

$o | ConvertTo-Json -Depth 4 -Compress
