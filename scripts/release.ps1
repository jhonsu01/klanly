<#
.SYNOPSIS
  Gestiona la version de Klanly y dispara una nueva Release.

.DESCRIPTION
  - Actualiza la version en: VERSION, tauri.conf.json, Cargo.toml y app/build.gradle.kts
  - Hace commit, crea el tag vX.Y.Z y lo empuja.
  - El push del tag dispara el workflow .github/workflows/release.yml, que compila
    el .msi y el .apk, publica la Release y elimina las anteriores.

  IMPORTANTE: escribe SIEMPRE en UTF-8 SIN BOM. `Set-Content -Encoding utf8`
  en Windows PowerShell 5.1 agrega un BOM que rompe el parser JSON de Tauri
  (serde_json: "expected value at line 1 column 1"). Por eso usamos .NET.

.EXAMPLE
  ./scripts/release.ps1 -Version 0.3.0
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
function Write-TextNoBom([string]$RelPath, [string]$Content) {
  $full = Join-Path $root $RelPath
  [IO.File]::WriteAllText($full, $Content, $Utf8NoBom)
}
function Read-Text([string]$RelPath) {
  [IO.File]::ReadAllText((Join-Path $root $RelPath))
}

Write-Host "==> Actualizando a version $Version" -ForegroundColor Cyan

# 1) VERSION
Write-TextNoBom "VERSION" "$Version`n"

# 2) tauri.conf.json
$tauri = "apps/admin-windows/src-tauri/tauri.conf.json"
$t = Read-Text $tauri
$t = $t -replace '"version":\s*"\d+\.\d+\.\d+"', "`"version`": `"$Version`""
Write-TextNoBom $tauri $t

# 3) Cargo.toml (primera aparicion: version del paquete)
$cargo = "apps/admin-windows/src-tauri/Cargo.toml"
$c = Read-Text $cargo
$c = [regex]::Replace($c, '(?m)^version = "\d+\.\d+\.\d+"', "version = `"$Version`"", 1)
Write-TextNoBom $cargo $c

# 4) Android versionName (+ incremento de versionCode)
$gradle = "apps/android/app/build.gradle.kts"
$g = Read-Text $gradle
$g = $g -replace 'versionName = "\d+\.\d+\.\d+"', "versionName = `"$Version`""
$codeMatch = [regex]::Match($g, 'versionCode = (\d+)')
if ($codeMatch.Success) {
  $newCode = [int]$codeMatch.Groups[1].Value + 1
  $g = $g -replace 'versionCode = \d+', "versionCode = $newCode"
}
Write-TextNoBom $gradle $g

# 5) Commit + tag + push
# Nota: git escribe avisos (p. ej. "LF will be replaced by CRLF") en stderr y
# PowerShell los convierte en NativeCommandError, abortando el script aunque el
# comando haya funcionado. Por eso silenciamos stderr en los comandos de git.
git add -A 2>$null
git commit -m "chore(release): v$Version" 2>$null
git tag "v$Version" 2>$null
git push origin HEAD 2>$null
git push origin "v$Version" 2>$null

Write-Host "==> Tag v$Version empujado. GitHub Actions compilara y publicara la Release." -ForegroundColor Green
Write-Host "    Sigue el progreso con:  gh run watch" -ForegroundColor DarkGray
