# Respaldo automatizado de PostgreSQL y almacenamiento de evidencias (TerrenoCNR)
param(
  [string]$BackupRoot = "d:\Desarrollos - Apps\TerrenoCNR\backups",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$targetDir = Join-Path $BackupRoot $stamp
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

Write-Host "[1/3] Respaldando base de datos PostgreSQL..."
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if ($pgDump -and $env:DATABASE_URL) {
  & pg_dump "$env:DATABASE_URL" --format=custom --file (Join-Path $targetDir "terreno_cnr.dump")
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  docker exec terreno-postgres pg_dump -U postgres -Fc terreno_cnr | Set-Content -AsByteStream -Path (Join-Path $targetDir "terreno_cnr.dump")
} else {
  Write-Warning "No se encontró pg_dump ni contenedor docker terreno-postgres."
}

Write-Host "[2/3] Respaldando archivos de evidencias y documentos..."
$storageDir = "d:\Desarrollos - Apps\TerrenoCNR\apps\api\storage"
if (Test-Path $storageDir) {
  Compress-Archive -Path "$storageDir\*" -DestinationPath (Join-Path $targetDir "storage.zip") -Force
}

Write-Host "[3/3] Aplicando retención de $RetentionDays días..."
Get-ChildItem -Path $BackupRoot -Directory | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } | Remove-Item -Recurse -Force

Write-Host "Respaldo completado en: $targetDir"
