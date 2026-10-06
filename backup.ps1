$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = Join-Path $PSScriptRoot "backups"

if (!(Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$backupFile = Join-Path $backupDir "themegood_$ts.sql"

& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p themegood > $backupFile

Write-Host "Backup created: $backupFile"
