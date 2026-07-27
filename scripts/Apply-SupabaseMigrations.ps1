#Requires -Version 5.1
<#
.SYNOPSIS
  Aplica migrations SQL pendentes do Supabase conforme supabase/migrations/manifest.json

.EXAMPLE
  .\scripts\Apply-SupabaseMigrations.ps1 -BaselineThrough 0026
#>
param(
    [string]$ContainerName = "supabase_db_RH_eletropasso",
    [string]$DbUser = "postgres",
    [string]$DbName = "postgres",
    [string]$ManifestPath = "",
    [string]$BaselineThrough = "",
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ManifestPath) {
    $ManifestPath = Join-Path $Root "supabase\migrations\manifest.json"
}
$MigrationsDir = Join-Path $Root "supabase\migrations"

function Invoke-Psql {
    param([string]$Sql)
    if ($WhatIf) { return }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $Sql | docker exec -i $ContainerName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 2>&1 | Out-Host
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw ('psql failed exit ' + $LASTEXITCODE) }
}

function Invoke-PsqlFile {
    param([string]$FilePath)
    if ($WhatIf) {
        Write-Host ('[what-if] would apply: ' + $FilePath)
        return
    }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Get-Content -Raw -Encoding UTF8 $FilePath | docker exec -i $ContainerName psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 2>&1 | Out-Host
    $ErrorActionPreference = $prev
    if ($LASTEXITCODE -ne 0) { throw ('Failed applying ' + $FilePath) }
}

function Escape-SqlLiteral([string]$s) {
    return $s.Replace("'", "''")
}

Write-Host "=== RH_Eletropasso - Supabase migrations ===" -ForegroundColor Cyan
Write-Host ("Container: " + $ContainerName)
Write-Host ("Manifest:  " + $ManifestPath)

if (-not (Test-Path $ManifestPath)) { throw ('Manifest not found: ' + $ManifestPath) }
$manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath | ConvertFrom-Json

$bootstrap = @'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version     text PRIMARY KEY,
  filename    text NOT NULL,
  title       text NOT NULL,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text NOT NULL DEFAULT 'Apply-SupabaseMigrations.ps1'
);
COMMENT ON TABLE public.schema_migrations IS 'Registro de migrations SQL aplicadas (manifesto: supabase/migrations/manifest.json)';
'@

Write-Host ""
Write-Host "Ensuring schema_migrations registry..." -ForegroundColor Yellow
Invoke-Psql -Sql $bootstrap

$appliedRows = @()
if (-not $WhatIf) {
    $listSql = 'SELECT version FROM public.schema_migrations ORDER BY version;'
    $raw = docker exec $ContainerName psql -U $DbUser -d $DbName -t -A -c $listSql
    if ($LASTEXITCODE -ne 0) { throw 'Could not read schema_migrations' }
    $appliedRows = @($raw -split "`n" | Where-Object { $_.Trim() -ne "" } | ForEach-Object { $_.Trim() })
}
$applied = [System.Collections.Generic.HashSet[string]]::new([string[]]$appliedRows)

$baselineLimit = $BaselineThrough.Trim()
$appliedCount = 0
$skippedCount = 0
$baselineCount = 0

foreach ($entry in $manifest.migrations) {
    $version = $entry.version
    $file = $entry.file
    $title = $entry.title
    $path = Join-Path $MigrationsDir $file

    if (-not (Test-Path $path)) { throw ('Migration file missing: ' + $path) }

    if ($applied.Contains($version)) {
        Write-Host ("  skip " + $version + " (already registered)") -ForegroundColor DarkGray
        $skippedCount++
        continue
    }

    $shouldBaseline = ($baselineLimit -ne "") -and ([int]$version -le [int]$baselineLimit)

    if ($shouldBaseline) {
        Write-Host ("  baseline " + $version + " - " + $title) -ForegroundColor DarkYellow
        if (-not $WhatIf) {
            $t = Escape-SqlLiteral $title
            $f = Escape-SqlLiteral $file
            $ins = "INSERT INTO public.schema_migrations (version, filename, title, applied_by) VALUES ('" + $version + "', '" + $f + "', '" + $t + "', 'baseline');"
            Invoke-Psql -Sql $ins
        }
        $baselineCount++
        continue
    }

    Write-Host ("  apply " + $version + " - " + $title) -ForegroundColor Green
    Invoke-PsqlFile -FilePath $path
    if (-not $WhatIf) {
        $t = Escape-SqlLiteral $title
        $f = Escape-SqlLiteral $file
        $ins = "INSERT INTO public.schema_migrations (version, filename, title) VALUES ('" + $version + "', '" + $f + "', '" + $t + "');"
        Invoke-Psql -Sql $ins
    }
    $appliedCount++
}

Write-Host ""
Write-Host ("Done. Applied: " + $appliedCount + " | Baseline: " + $baselineCount + " | Skipped: " + $skippedCount) -ForegroundColor Cyan

if (-not $WhatIf) {
    Write-Host ""
    Write-Host "Registry contents:" -ForegroundColor Cyan
    $showSql = 'SELECT version, filename, applied_at, applied_by FROM public.schema_migrations ORDER BY version;'
    docker exec $ContainerName psql -U $DbUser -d $DbName -c $showSql
}
