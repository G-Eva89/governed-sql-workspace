$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$PagilaDir = Join-Path $RootDir "third_party\pagila"
$SchemaFile = Join-Path $PagilaDir "pagila-schema.sql"
$DataFile = Join-Path $PagilaDir "pagila-data.sql"
$RoSql = Join-Path $RootDir "scripts\create-pagila-ro.sql"

$PagilaRepo = "https://raw.githubusercontent.com/devrimgunduz/pagila/master"
$TargetContainer = if ($env:TARGET_DB_CONTAINER) { $env:TARGET_DB_CONTAINER } else { "gsw-target-db" }
$TargetPort = if ($env:TARGET_DB_PORT) { $env:TARGET_DB_PORT } else { "5434" }
$TargetSuperuser = if ($env:TARGET_DB_SUPERUSER) { $env:TARGET_DB_SUPERUSER } else { "postgres" }

New-Item -ItemType Directory -Force -Path $PagilaDir | Out-Null

function Download-IfMissing {
    param([string]$Url, [string]$Dest)
    if (-not (Test-Path $Dest)) {
        Write-Host "Downloading $(Split-Path -Leaf $Dest)..."
        Invoke-WebRequest -Uri $Url -OutFile $Dest -UseBasicParsing
    }
}

Download-IfMissing "$PagilaRepo/pagila-schema.sql" $SchemaFile
Download-IfMissing "$PagilaRepo/pagila-data.sql" $DataFile

Write-Host "Waiting for target-db..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    docker exec $TargetContainer pg_isready -U $TargetSuperuser 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    throw "target-db did not become ready in time"
}

function Invoke-Psql {
    param([string[]]$Args)
    & docker exec -i $TargetContainer psql -v ON_ERROR_STOP=1 -U $TargetSuperuser @Args
    if ($LASTEXITCODE -ne 0) { throw "psql failed" }
}

$dbExists = docker exec $TargetContainer psql -U $TargetSuperuser -tAc "SELECT 1 FROM pg_database WHERE datname = 'pagila';"
if ($dbExists.Trim() -ne "1") {
    Write-Host "Creating pagila database..."
    Invoke-Psql -Args @("-c", "CREATE DATABASE pagila;")
}

$filmExists = docker exec $TargetContainer psql -U $TargetSuperuser -d pagila -tAc "SELECT to_regclass('public.film') IS NOT NULL;" 2>$null
if ($filmExists.Trim() -eq "t") {
    Write-Host "Pagila already loaded; skipping schema/data import."
} else {
    Write-Host "Loading Pagila schema..."
    docker cp $SchemaFile "${TargetContainer}:/tmp/pagila-schema.sql"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying schema into container" }
    Invoke-Psql -Args @("-d", "pagila", "-f", "/tmp/pagila-schema.sql")

    Write-Host "Loading Pagila data (this may take a minute)..."
    docker cp $DataFile "${TargetContainer}:/tmp/pagila-data.sql"
    if ($LASTEXITCODE -ne 0) { throw "Failed copying data into container" }
    Invoke-Psql -Args @("-d", "pagila", "-f", "/tmp/pagila-data.sql")
}

Write-Host "Creating pagila_ro read-only role..."
docker cp $RoSql "${TargetContainer}:/tmp/create-pagila-ro.sql"
if ($LASTEXITCODE -ne 0) { throw "Failed copying role SQL into container" }
Invoke-Psql -Args @("-d", "pagila", "-f", "/tmp/create-pagila-ro.sql")

$filmCount = docker exec $TargetContainer psql -U $TargetSuperuser -d pagila -tAc "SELECT COUNT(*) FROM film;"
Write-Host "Pagila ready: $($filmCount.Trim()) films in public.film"

docker exec $TargetContainer psql -v ON_ERROR_STOP=1 -U pagila_ro -d pagila -c "SELECT COUNT(*) AS film_count FROM film;" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pagila_ro smoke test failed" }

Write-Host "pagila_ro can SELECT from Pagila."
Write-Host "Done. Connect with:"
Write-Host "  psql postgresql://pagila_ro:pagila_ro@localhost:$TargetPort/pagila"
