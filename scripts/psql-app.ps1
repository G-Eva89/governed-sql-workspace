$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
$Container = if ($env:APP_DB_CONTAINER) { $env:APP_DB_CONTAINER } else { "gsw-app-db" }
$DbUser = if ($env:APP_DB_USER) { $env:APP_DB_USER } else { "app" }
$DbName = if ($env:APP_DB_NAME) { $env:APP_DB_NAME } else { "workspace_app" }

if ($args.Count -eq 0) {
    docker exec -it $Container psql -U $DbUser -d $DbName
} else {
    docker exec -i $Container psql -U $DbUser -d $DbName @args
}

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
