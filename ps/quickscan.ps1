# Screen Trainer - Mewtwo's "Quick scan": asks Microsoft Defender to run its own quick scan.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# Only ever run when the user presses the button. What it finds is shown by Windows Security. Keep it plain ASCII.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Start-MpScan -ScanType QuickScan
'done'
