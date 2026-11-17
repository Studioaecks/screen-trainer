# Screen Trainer - Mewtwo's "Update protection": asks Microsoft Defender to fetch its newest definitions.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# Only ever run when the user presses the button. Keep it plain ASCII.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Update-MpSignature
'done'
