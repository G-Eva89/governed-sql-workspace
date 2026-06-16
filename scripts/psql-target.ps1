$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$Container = if ($env:TARGET_DB_CONTAINER) { $env:TARGET_DB_CONTAINER } else { "gsw-target-db" }
$DbUser = if ($env:TARGET_DB_USER) { $env:TARGET_DB_USER } else { "pagila_ro" }
$DbName = if ($env:TARGET_DB_NAME) { $env:TARGET_DB_NAME } else { "pagila" }

if ($args.Count -eq 0) {
    docker exec -it $Container psql -U $DbUser -d $DbName
} else {
    docker exec -i $Container psql -U $DbUser -d $DbName @args
}

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
