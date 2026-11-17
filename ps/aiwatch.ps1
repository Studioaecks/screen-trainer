# Screen Trainer - Mewtwo's AI watch (0.9.9): which programs are running, which start with Windows, which listen on
# the ports local AI servers use, and which programs Mewtwo has blocked from the internet.
# Run by sentinel.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# It only reads, and prints one line of JSON as its last line. sentinel.js picks the AI programs out of the list by
# name; nothing else of the list is kept or shown. Keep this file plain ASCII.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$o = [ordered]@{}

try {
  $seen = @{}
  $o.running = @(Get-Process | Where-Object { $_.Path } | ForEach-Object {
    if (-not $seen.ContainsKey($_.Path)) { $seen[$_.Path] = 1; [ordered]@{ name = "$($_.ProcessName)"; path = "$($_.Path)"; id = [int]$_.Id } }
  })
} catch { $o.runningError = "$($_.Exception.Message)" }

try {
  $o.startup = @(Get-CimInstance Win32_StartupCommand | ForEach-Object { [ordered]@{ name = "$($_.Name)"; command = "$($_.Command)" } })
} catch { $o.startupError = "$($_.Exception.Message)" }

try {
  $ports = 11434, 1234, 5001, 7860, 8188, 8080, 8000, 3000, 5000, 1337, 4891
  $o.listening = @(Get-NetTCPConnection -State Listen | Where-Object { $ports -contains $_.LocalPort } | ForEach-Object {
    [ordered]@{ port = [int]$_.LocalPort; id = [int]$_.OwningProcess; address = "$($_.LocalAddress)" }
  })
} catch { $o.listeningError = "$($_.Exception.Message)" }

try {
  $o.blocked = @(Get-NetFirewallRule -DisplayName 'Screen Trainer Mewtwo block - *' | ForEach-Object {
    $app = ''
    try { $app = "$(($_ | Get-NetFirewallApplicationFilter).Program)" } catch { }
    [ordered]@{ rule = "$($_.DisplayName)"; program = $app; on = ("$($_.Enabled)" -eq 'True') }
  })
} catch { $o.blocked = @() }

ConvertTo-Json -Compress -Depth 4 -InputObject $o
