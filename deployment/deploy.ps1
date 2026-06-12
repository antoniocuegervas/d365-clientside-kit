<#
.SYNOPSIS
  Non-interactive webresource publish via SPKL.

.DESCRIPTION
  Builds the kit bundles and pushes them as webresources using spkl.exe.
  The Dataverse connection string is NEVER committed, supply it via:
    1. the SPKL_CONNECTION environment variable, or
    2. deployment/connection.local.json ({ "connectionString": "..." }),
       which is gitignored.

  Source maps are generated locally but not deployed (Dataverse size limits)
  spkl.json only lists the .html/.js artifacts.

.EXAMPLE
  $env:SPKL_CONNECTION = "AuthType=OAuth;Url=https://org.crm.dynamics.com;..."
  ./deployment/deploy.ps1
#>
param(
  # Path to spkl.exe, restore the spkl NuGet package and point here, e.g.
  # nuget install spkl -OutputDirectory deployment/packages
  [string]$SpklPath = "$PSScriptRoot/packages/spkl/tools/spkl.exe",
  [string]$PublisherPrefix = "new_"
)

$ErrorActionPreference = "Stop"

# 1. Resolve the connection string (env var wins, local file as fallback).
$connection = $env:SPKL_CONNECTION
if (-not $connection) {
  $localFile = Join-Path $PSScriptRoot "connection.local.json"
  if (Test-Path $localFile) {
    $connection = (Get-Content $localFile -Raw | ConvertFrom-Json).connectionString
  }
}
if (-not $connection) {
  throw "No connection string. Set SPKL_CONNECTION or create deployment/connection.local.json (gitignored)."
}

# 2. Build the artifacts with the requested publisher prefix.
Push-Location (Join-Path $PSScriptRoot "..")
try {
  $env:PUBLISHER_PREFIX = $PublisherPrefix
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Kit build failed." }
} finally {
  Pop-Location
}

# 3. Publish webresources non-interactively.
if (-not (Test-Path $SpklPath)) {
  throw "spkl.exe not found at '$SpklPath'. Restore the spkl NuGet package first (see param help)."
}
& $SpklPath webresources (Join-Path $PSScriptRoot "spkl.json") $connection
if ($LASTEXITCODE -ne 0) { throw "SPKL webresource deployment failed." }

Write-Host "Webresources deployed. Remember to publish customizations if SPKL was configured not to."
