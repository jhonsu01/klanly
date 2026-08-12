<#
.SYNOPSIS
  Compila el APK de Klanly EN LOCAL y (opcionalmente) lo publica en la Release
  de GitHub, sin gastar minutos de GitHub Actions.

.DESCRIPTION
  Se creo porque se superaron los limites de minutos de GitHub Actions: el
  workflow .github/workflows/release.yml ya NO se dispara con los tags.

  Requisitos (una sola vez):
    - JDK 17     -> winget install EclipseAdoptium.Temurin.17.JDK
    - Android SDK (platform-tools + platforms;android-34 + build-tools;34.0.0)
      La forma mas simple es instalar Android Studio, o las command line tools
      y luego:  sdkmanager "platforms;android-34" "build-tools;34.0.0"
    - Variable ANDROID_HOME o ANDROID_SDK_ROOT apuntando al SDK.

.PARAMETER Version
  Version a compilar (ej. 0.7.0). Si se omite, usa el contenido de VERSION.

.PARAMETER Publish
  Publica el APK en la Release de GitHub del tag vX.Y.Z (crea el tag y la
  release si no existen) usando `gh`. Sin este flag solo compila.

.PARAMETER Release
  Compila en modo release en vez de debug. OJO: el APK de release necesita
  firma; sin keystore configurado usa debug (que es lo que se publicaba en CI).

.EXAMPLE
  .\scripts\build-apk.ps1
  .\scripts\build-apk.ps1 -Version 0.7.0 -Publish
#>
param(
  [string]$Version,
  [switch]$Publish,
  [switch]$Release
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$android = Join-Path $repo 'apps\android'

# ── 1) Version ───────────────────────────────────────────────────────────────
if (-not $Version) {
  $vf = Join-Path $repo 'VERSION'
  if (Test-Path $vf) { $Version = (Get-Content $vf -Raw).Trim() }
  else { throw "No hay VERSION ni parametro -Version" }
}
Write-Host "==> Klanly APK v$Version" -ForegroundColor Cyan

# ── 2) Comprobar el entorno ─────────────────────────────────────────────────
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk -or -not (Test-Path $sdk)) {
  Write-Host "ERROR: no encuentro el Android SDK." -ForegroundColor Red
  Write-Host "       Define ANDROID_HOME, por ejemplo:" -ForegroundColor DarkGray
  Write-Host '       $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"' -ForegroundColor DarkGray
  Write-Host "       Ver scripts/build-local.md para la instalacion completa." -ForegroundColor DarkGray
  exit 1
}
Write-Host "    Android SDK: $sdk" -ForegroundColor DarkGray

# local.properties es lo que Gradle lee para localizar el SDK
$lp = Join-Path $android 'local.properties'
$sdkEscaped = $sdk -replace '\\', '\\'
Set-Content -Path $lp -Value "sdk.dir=$sdkEscaped" -Encoding utf8
Write-Host "    local.properties escrito" -ForegroundColor DarkGray

# ── 3) Compilar ─────────────────────────────────────────────────────────────
$task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
Write-Host "==> Gradle $task (esto tarda unos minutos la primera vez)" -ForegroundColor Cyan

Push-Location $android
try {
  $gradlew = Join-Path $android 'gradlew.bat'
  if (-not (Test-Path $gradlew)) { throw "Falta gradlew.bat en apps/android" }
  # Gradle escribe avisos y progreso en stderr. Con ErrorActionPreference='Stop'
  # PowerShell los convierte en NativeCommandError y aborta aunque la
  # compilacion vaya bien, asi que lo bajamos para esta llamada.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  # --no-daemon evita dejar procesos de Gradle colgados entre compilaciones
  & $gradlew $task --no-daemon
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) { throw "Gradle fallo con codigo $code" }
} finally {
  Pop-Location
}

# ── 4) Localizar y renombrar el APK ─────────────────────────────────────────
$variant = if ($Release) { 'release' } else { 'debug' }
$built = Get-ChildItem -Path (Join-Path $android "app\build\outputs\apk\$variant") -Filter '*.apk' -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $built) { throw "No se genero ningun APK en app/build/outputs/apk/$variant" }

$distDir = Join-Path $repo 'dist'
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
$final = Join-Path $distDir "Klanly-$Version.apk"
Copy-Item $built.FullName $final -Force

$mb = [math]::Round($built.Length / 1MB, 2)
Write-Host "==> APK listo: $final ($mb MB)" -ForegroundColor Green

# ── 5) Publicar en GitHub (sin usar Actions) ────────────────────────────────
if ($Publish) {
  $tag = "v$Version"
  Write-Host "==> Publicando en la Release $tag" -ForegroundColor Cyan
  $ErrorActionPreference = 'Continue'

  # ?Existe ya la release?
  gh release view $tag *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "    Creando release $tag" -ForegroundColor DarkGray
    gh release create $tag $final --title "Klanly $tag" --notes "Compilado en local (GitHub Actions desactivado por limite de minutos)."
  } else {
    Write-Host "    Subiendo APK a la release existente" -ForegroundColor DarkGray
    gh release upload $tag $final --clobber
  }
  if ($LASTEXITCODE -eq 0) {
    Write-Host "==> Publicado: https://github.com/jhonsu01/klanly/releases/tag/$tag" -ForegroundColor Green
  } else {
    Write-Host "ERROR al publicar. Sube el archivo a mano desde la pagina de Releases." -ForegroundColor Red
  }
} else {
  Write-Host "    (Sin -Publish: el APK quedo solo en dist/)" -ForegroundColor DarkGray
}
