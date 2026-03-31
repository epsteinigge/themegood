$ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupDir = ".\backups"

if (!(Test-Path $backupDir)) {
  New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$backupFile = "$backupDir\themegood_$ts.sql"

& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p themegood > $backupFile

Write-Host "Backup created: $backupFile"