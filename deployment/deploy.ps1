<#
.SYNOPSIS
  Non-interactive webresource publish via SPKL.

.DESCRIPTION
  Builds the kit bundles and pushes them as webresources using spkl.exe.
  The Dataverse connection string is NEVER committed, supply it via:
    1. the SPKL_CONNECTION environment variable, or
    2. deployment/connection.local.json ({ "connectionString": "AuthType=OAuth;Url=https://org.crm.dynamics.com;..." }),
       which is gitignored.

  Source maps are generated locally but not deployed (Dataverse size limits)
  spkl.json only lists the .html/.js artifacts.

  The publisher prefix comes from kit.config.json at the repo root. The build and
  this deploy read the same file, so the artifacts and the webresources match.

.EXAMPLE
  $env:SPKL_CONNECTION = "AuthType=OAuth;Url=https://org.crm.dynamics.com;..."
  ./deployment/deploy.ps1
#>
param(
  # Path to spkl.exe, restore the spkl NuGet package and point here, e.g.
  # nuget install spkl -OutputDirectory deployment/packages
  [string]$SpklPath = "$PSScriptRoot/packages/spkl/tools/spkl.exe"
)

$ErrorActionPreference = "Stop"

# Publisher prefix: the single source of truth both this deploy and the build read,
# so the artifacts and the deployed webresources are named identically.
$kitConfig = Get-Content (Join-Path $PSScriptRoot "../kit.config.json") -Raw | ConvertFrom-Json
$prefix = $kitConfig.publisherPrefix
if (-not $prefix) { throw "publisherPrefix missing from kit.config.json." }

# Target solution: an optional "solutionName" in kit.config.json, so a fork's
# webresources land in its own solution without hand-editing the template.
$solution = $kitConfig.solutionName
if (-not $solution) { $solution = "D365UIKit" }

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

# 2. Build the artifacts. webpack reads the same kit.config.json, so no env var.
Push-Location (Join-Path $PSScriptRoot "..")
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Kit build failed." }
} finally {
  Pop-Location
}

# 3. Render the spkl manifest from the same prefix that named the build artifacts,
#    so the webresource names and the built files cannot drift.
$template = Join-Path $PSScriptRoot "spkl.template.json"
if (-not (Test-Path $template)) { throw "spkl.template.json not found at '$template'." }
# spkl requires the manifest to be named exactly spkl.json and to sit beside the
# build (its "../dist/" root is relative to this folder), so render in place. The
# file is gitignored; spkl.template.json is the committed source of truth.
$manifest = Join-Path $PSScriptRoot "spkl.json"
(Get-Content $template -Raw).Replace("{{prefix}}", $prefix).Replace("{{solution}}", $solution) |
  Set-Content $manifest -NoNewline

# 4. Publish webresources non-interactively.
if (-not (Test-Path $SpklPath)) {
  throw "spkl.exe not found at '$SpklPath'. Restore the spkl NuGet package first (see param help)."
}
& $SpklPath webresources $manifest $connection
if ($LASTEXITCODE -ne 0) { throw "SPKL webresource deployment failed." }

Write-Host "Webresources deployed. Remember to publish customizations if SPKL was configured not to."
