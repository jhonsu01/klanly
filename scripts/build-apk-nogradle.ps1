<#
.SYNOPSIS
  Compila el APK de Klanly SIN GRADLE. Envoltorio de build-apk-nogradle.sh.

.DESCRIPTION
  La implementacion real vive en `scripts/build-apk-nogradle.sh` y se ejecuta
  con el Bash que trae Git para Windows.

  Por que Bash y no PowerShell nativo: la version en PowerShell puro se colgaba
  invocando al compilador de Kotlin (un `java.exe` saturando la CPU >20 min con
  un unico archivo de 100 lineas). La misma cadena de comandos en Bash termina
  en ~9 segundos. No merecia la pena pelearse con el paso de argumentos de
  PowerShell hacia procesos nativos cuando la ruta en Bash funciona.

  Requisitos: Git para Windows (bash), Android SDK con build-tools y
  platforms/android-34, un JDK, y el compilador de Kotlin (Android Studio o la
  cache de Gradle). Ver scripts/build-local.md.

.PARAMETER Version
  Version a compilar. Por defecto lee el archivo VERSION del repo.

.PARAMETER Publish
  Sube el APK a la Release del tag vX.Y.Z con `gh`.

.EXAMPLE
  .\scripts\build-apk-nogradle.ps1
  .\scripts\build-apk-nogradle.ps1 -Version 0.7.1 -Publish
#>
param(
  [string]$Version,
  [switch]$Publish
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$sh = Join-Path $PSScriptRoot 'build-apk-nogradle.sh'
if (-not (Test-Path $sh)) { Write-Host "ERROR: falta $sh" -ForegroundColor Red; exit 1 }

# Localizar el bash de Git para Windows
$bash = $null
foreach ($c in @(
  "$env:ProgramFiles\Git\bin\bash.exe",
  "${env:ProgramFiles(x86)}\Git\bin\bash.exe",
  "$env:LOCALAPPDATA\Programs\Git\bin\bash.exe"
)) { if (Test-Path $c) { $bash = $c; break } }
if (-not $bash) { $bash = (Get-Command bash -ErrorAction SilentlyContinue).Source }
if (-not $bash) {
  Write-Host "ERROR: no encuentro bash. Instala Git para Windows:" -ForegroundColor Red
  Write-Host "       winget install Git.Git" -ForegroundColor DarkGray
  exit 1
}

# El SDK se pasa por entorno; si no esta definido, probamos la ruta habitual
if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  $guess = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $guess) { $env:ANDROID_HOME = $guess }
}
if ($Version) { $env:VERSION = $Version }

$args = @()
if ($Publish) { $args += '--publish' }

# Ruta estilo Unix para bash
$shUnix = '/' + ($sh -replace '^([A-Za-z]):', '$1' -replace '\\', '/')
$shUnix = $shUnix -replace '^/([A-Za-z]):?', '/$1'

$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'   # bash escribe progreso en stderr
& $bash $sh @args
$code = $LASTEXITCODE
$ErrorActionPreference = $prev
exit $code
