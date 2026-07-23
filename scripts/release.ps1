<#
.SYNOPSIS
  Gestiona la version de Klanly y dispara una nueva Release.

.DESCRIPTION
  - Actualiza la version en: VERSION, tauri.conf.json, Cargo.toml y app/build.gradle.kts
  - Hace commit, crea el tag vX.Y.Z y lo empuja.
  - El push del tag dispara el workflow .github/workflows/release.yml, que compila
    el .msi y el .apk, publica la Release y elimina las anteriores.

.EXAMPLE
  ./scripts/release.ps1 -Version 0.2.0
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "==> Actualizando a version $Version" -ForegroundColor Cyan

# 1) VERSION
Set-Content -Path "VERSION" -Value $Version -Encoding utf8 -NoNewline

# 2) tauri.conf.json
$tauri = "apps/admin-windows/src-tauri/tauri.conf.json"
(Get-Content $tauri -Raw) -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`"" |
  Set-Content $tauri -Encoding utf8

# 3) Cargo.toml (primera aparicion: version del paquete)
$cargo = "apps/admin-windows/src-tauri/Cargo.toml"
$cargoContent = Get-Content $cargo -Raw
$cargoContent = [regex]::Replace($cargoContent, '(?m)^version = "\d+\.\d+\.\d+"', "version = `"$Version`"", 1)
Set-Content $cargo -Value $cargoContent -Encoding utf8

# 4) Android versionName (+ incremento de versionCode)
$gradle = "apps/android/app/build.gradle.kts"
$g = Get-Content $gradle -Raw
$g = $g -replace 'versionName = "\d+\.\d+\.\d+"', "versionName = `"$Version`""
$codeMatch = [regex]::Match($g, 'versionCode = (\d+)')
if ($codeMatch.Success) {
  $newCode = [int]$codeMatch.Groups[1].Value + 1
  $g = $g -replace 'versionCode = \d+', "versionCode = $newCode"
}
Set-Content $gradle -Value $g -Encoding utf8

# 5) Commit + tag + push
git add -A
git commit -m "chore(release): v$Version"
git tag "v$Version"
git push origin HEAD
git push origin "v$Version"

Write-Host "==> Tag v$Version empujado. GitHub Actions compilara y publicara la Release." -ForegroundColor Green
Write-Host "    Sigue el progreso con:  gh run watch" -ForegroundColor DarkGray
