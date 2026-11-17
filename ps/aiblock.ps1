# Screen Trainer - Mewtwo blocks one program from the internet, or lets it out again (0.9.9).
# Run by sentinel.js as: powershell -NoProfile -ExecutionPolicy Bypass -File <this file> -Mode block|unblock -Program <full path of an .exe>
# This is the ONE thing in Screen Trainer that needs administrator rights, and only when the owner pressed "Block" or
# "Unblock" in Mewtwo's window: Windows then asks the owner to allow it (the usual administrator prompt), every time.
#   block    adds two Windows Firewall rules (out and in) for exactly that program, named
#            "Screen Trainer Mewtwo block - <file name>". The program keeps running; it just cannot reach the network.
#   unblock  removes those two rules again, and nothing else.
# No other rule is read, changed or removed, the firewall itself is not switched, and no program is stopped.
# Prints one line of JSON as its last line. Keep this file plain ASCII.
param([string]$Mode = '', [string]$Program = '', [string]$Out = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Answer($obj) {
  $json = ConvertTo-Json -Compress -InputObject $obj
  if ($Out) { [IO.File]::WriteAllText($Out, $json) }
  $json
}

if ($Mode -ne 'block' -and $Mode -ne 'unblock') { Answer @{ ok = $false; error = 'unknown mode' }; exit 0 }
if ($Program -notmatch '^[A-Za-z]:\\[A-Za-z0-9 _.\-()\\]+\.exe$' -or -not (Test-Path -LiteralPath $Program -PathType Leaf)) { Answer @{ ok = $false; error = 'not a program this can be done for' }; exit 0 }
$name = 'Screen Trainer Mewtwo block - ' + [IO.Path]::GetFileName($Program)

$me = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  # not an administrator yet: Windows asks the owner, and this same file runs once more with the same two values
  $tmp = Join-Path $env:TEMP ('st-aiblock-' + [Guid]::NewGuid().ToString('N') + '.json')
  $list = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Mode ' + $Mode + ' -Program "' + $Program + '" -Out "' + $tmp + '"'
  try {
    $p = Start-Process -FilePath powershell.exe -ArgumentList $list -Verb RunAs -WindowStyle Hidden -Wait -PassThru
    if (Test-Path -LiteralPath $tmp) { Get-Content -LiteralPath $tmp -Raw; [IO.File]::Delete($tmp) } else { Answer @{ ok = $false; error = 'no answer' } }
  } catch { '{"ok":false,"error":"not allowed","declined":true}' }
  exit 0
}

try {
  Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  if ($Mode -eq 'block') {
    [void](New-NetFirewallRule -DisplayName $name -Direction Outbound -Program $Program -Action Block -Profile Any -Description 'Made by Screen Trainer (Mewtwo) because you asked it to. Remove it in Mewtwo''s window, or here.')
    [void](New-NetFirewallRule -DisplayName $name -Direction Inbound -Program $Program -Action Block -Profile Any -Description 'Made by Screen Trainer (Mewtwo) because you asked it to. Remove it in Mewtwo''s window, or here.')
  }
  Answer @{ ok = $true; mode = $Mode; rule = $name }
} catch { Answer @{ ok = $false; error = "$($_.Exception.Message)" } }
