# Screen Trainer - Mewtwo asks Windows: Microsoft Defender, the firewall, other antivirus products, recent threats.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# It only reads, and prints one line of JSON as its last line. Each part has its own try/catch, so one part that
# Windows refuses does not lose the others. Keep this file plain ASCII (Windows PowerShell reads files without a
# BOM as ANSI), and keep every name guardian.js reads (readSecurity, readUpdates, readSystem and advise() there).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$o = [ordered]@{}

try {
  $s = Get-MpComputerStatus
  $o.defender = [ordered]@{
    enabled    = [bool]$s.AntivirusEnabled
    realtime   = [bool]$s.RealTimeProtectionEnabled
    service    = [bool]$s.AMServiceEnabled
    tamper     = [bool]$s.IsTamperProtected
    mode       = "$($s.AMRunningMode)"
    sigAge     = [double]$s.AntivirusSignatureAge
    sigVersion = "$($s.AntivirusSignatureVersion)"
    sigDate    = $(if ($s.AntivirusSignatureLastUpdated) { $s.AntivirusSignatureLastUpdated.ToString('s') } else { $null })
    quickAge   = [double]$s.QuickScanAge
    fullAge    = [double]$s.FullScanAge
  }
} catch { $o.defenderError = "$($_.Exception.Message)" }

try {
  $o.firewall = @(Get-NetFirewallProfile | ForEach-Object { [ordered]@{ name = "$($_.Name)"; on = ("$($_.Enabled)" -eq 'True') } })
} catch { $o.firewallError = "$($_.Exception.Message)" }

try {
  $o.products = @(Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct | ForEach-Object { "$($_.displayName)" })
} catch { }

try {
  $o.threats = @(Get-MpThreatDetection | Where-Object { $_.InitialDetectionTime -gt (Get-Date).AddDays(-30) }).Count
} catch { }

$o | ConvertTo-Json -Depth 4 -Compress
