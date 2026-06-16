$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot

Write-Host "Starting Docker services (app-db :5433, target-db :5434)..."
docker compose -f (Join-Path $RootDir "docker-compose.yml") up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

Write-Host "Waiting for app-db..."
$appReady = $false
for ($i = 0; $i -lt 60; $i++) {
    docker exec gsw-app-db pg_isready -U app -d workspace_app 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $appReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $appReady) {
    throw "app-db did not become ready in time"
}

& (Join-Path $RootDir "scripts\seed-target-pagila.ps1")

Write-Host ""
Write-Host "Dev environment is up:"
Write-Host "  App DB:    postgresql://app:app@localhost:5433/workspace_app"
Write-Host "  Target DB: postgresql://pagila_ro:pagila_ro@localhost:5434/pagila"
Write-Host ""
Write-Host "Next: apply app DB schema and seed admin user:"
Write-Host "  pnpm setup          # or: pnpm db:migrate && pnpm db:seed"
Write-Host "  pnpm --filter @governed-sql/api dev"
Write-Host ""
Write-Host "See README.md for full getting-started guide."
Write-Host ""
Write-Host "Connect with psql (no local client required):"
Write-Host "  pnpm db:psql:app"
Write-Host "  pnpm db:psql:target"
Write-Host "  pnpm db:psql:target -c `"SELECT COUNT(*) FROM film;`""
