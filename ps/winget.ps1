# Screen Trainer - Mewtwo asks winget which installed programs have a newer version.
# Run by guardian.js as: powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <this file>
# It only reads: the table winget prints is passed on as text. Keep it plain ASCII.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
& winget upgrade --include-unknown --disable-interactivity 2>&1 | Out-String
