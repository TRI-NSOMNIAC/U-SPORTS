# Links this folder to your hosted Supabase project and applies migrations.
# Prereq: install CLI https://supabase.com/docs/guides/cli
#   winget install Supabase.CLI   OR   scoop install supabase
#
# Usage:
#   .\scripts\link-and-push.ps1 -ProjectRef "abcdefghijklmnop"
#
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRef
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Using npx supabase (requires Node). For a global CLI: winget install Supabase.CLI"
Write-Host "Logging in (opens browser) if needed..."
npx supabase login

Write-Host "Linking project $ProjectRef ..."
npx supabase link --project-ref $ProjectRef

Write-Host "Pushing migrations..."
npx supabase db push

Write-Host "Done. Run seed in Dashboard SQL Editor if you have not: supabase/seed.sql"
Write-Host "Then: .\scripts\init-local-env.ps1 and fill .env files."
