# Copy env templates so Vite and the API can start after you paste real keys.
$root = Split-Path -Parent $PSScriptRoot

$webExample = Join-Path $root "apps\web\.env.example"
$webEnv = Join-Path $root "apps\web\.env"
if (-not (Test-Path $webEnv)) {
  Copy-Item $webExample $webEnv
  Write-Host "Created apps\web\.env - edit VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
} else {
  Write-Host "apps\web\.env already exists - skipped"
}

$serverExample = Join-Path $root "apps\server\.env.example"
$serverEnv = Join-Path $root "apps\server\.env"
if (-not (Test-Path $serverEnv)) {
  Copy-Item $serverExample $serverEnv
  Write-Host "Created apps\server\.env - edit SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
} else {
  Write-Host "apps\server\.env already exists - skipped"
}

Write-Host ""
Write-Host "Next: Supabase Dashboard > Project Settings > API - copy URL, anon key, and service_role into those .env files."
