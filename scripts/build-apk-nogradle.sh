#!/usr/bin/env bash
# ============================================================================
#  Klanly — compilar el APK SIN GRADLE (Git Bash / MSYS en Windows)
# ============================================================================
#  En esta maquina `gradlew` falla siempre con:
#      java.io.IOException: Unable to establish loopback connection
#      Caused by: java.net.SocketException: Invalid argument: connect
#  porque el demonio de Gradle no consigue aceptar su propia conexion de
#  loopback (filtros Winsock/NDIS de VirtualBox + adaptadores Hyper-V).
#  Diagnostico completo en scripts/build-local.md.
#
#  Este script se salta Gradle e invoca la cadena del SDK directamente:
#      aapt2 compile -> aapt2 link -> kotlinc -> d8 -> jar -> zipalign -> apksigner
#
#  Funciona porque la app es minima: UN archivo Kotlin, sin AndroidX ni
#  dependencias externas. Si algun dia se anaden librerias, este atajo deja de
#  servir (habria que resolver dependencias a mano).
#
#  Uso:
#      ./scripts/build-apk-nogradle.sh                 # compila
#      ./scripts/build-apk-nogradle.sh --publish       # compila y sube a la Release
#      VERSION=0.7.1 ./scripts/build-apk-nogradle.sh   # version explicita
# ============================================================================
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP="$REPO/apps/android/app"
GRADLE_FILE="$APP/build.gradle.kts"
W="$REPO/.tmp/apk"
PUBLISH=0
[[ "${1:-}" == "--publish" ]] && PUBLISH=1

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
info() { printf '    %s\n' "$1"; }
fail() { printf '\033[31mERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# ── Version y versionCode ───────────────────────────────────────────────────
VERSION="${VERSION:-$(tr -d '[:space:]' < "$REPO/VERSION")}"
VCODE="$(grep -oE 'versionCode = [0-9]+' "$GRADLE_FILE" | grep -oE '[0-9]+')"
[[ -n "$VERSION" && -n "$VCODE" ]] || fail "no pude determinar version/versionCode"
printf '\033[32mKlanly APK v%s (versionCode %s) — sin Gradle\033[0m\n' "$VERSION" "$VCODE"

# ── Localizar el SDK y las herramientas ─────────────────────────────────────
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$LOCALAPPDATA/Android/Sdk}}"
[[ -d "$SDK" ]] || fail "no encuentro el Android SDK (define ANDROID_HOME)"

# build-tools mas reciente
BT="$(ls -d "$SDK"/build-tools/*/ 2>/dev/null | sort -V | tail -1)"
BT="${BT%/}"
[[ -n "$BT" ]] || fail 'faltan build-tools (sdkmanager "build-tools;34.0.0")'

AAPT2="$BT/aapt2.exe"
ZIPALIGN="$BT/zipalign.exe"
D8JAR="$BT/lib/d8.jar"
SIGNERJAR="$BT/lib/apksigner.jar"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
for t in "$AAPT2" "$ZIPALIGN" "$D8JAR" "$SIGNERJAR" "$ANDROID_JAR"; do
  [[ -f "$t" ]] || fail "falta: $t"
done

# Compilador de Kotlin: el de Android Studio, o el embeddable de la cache de Gradle
KJAR=""
for c in \
  "/c/Program Files/Android/Android Studio/plugins/Kotlin/kotlinc/lib/kotlin-compiler.jar" \
  "$LOCALAPPDATA/Programs/Android Studio/plugins/Kotlin/kotlinc/lib/kotlin-compiler.jar"
do [[ -f "$c" ]] && { KJAR="$c"; break; }; done
if [[ -z "$KJAR" ]]; then
  KJAR="$(find "$HOME/.gradle/caches" -name 'kotlin-compiler-embeddable-*.jar' 2>/dev/null \
          | grep -v sources | sort -V | tail -1)"
fi
[[ -n "$KJAR" ]] || fail "no encuentro el compilador de Kotlin"

# kotlin-stdlib TIENE que entrar en el dex, no solo en el classpath
STDLIB="$(dirname "$KJAR")/kotlin-stdlib.jar"
if [[ ! -f "$STDLIB" ]]; then
  STDLIB="$(find "$HOME/.gradle/caches" -name 'kotlin-stdlib-1.9*.jar' 2>/dev/null \
            | grep -vE 'sources|common' | sort -V | tail -1)"
fi
[[ -f "$STDLIB" ]] || fail "no encuentro kotlin-stdlib.jar"

info "build-tools : $(basename "$BT")"
info "kotlinc     : $(basename "$KJAR")"

rm -rf "$W"; mkdir -p "$W/classes" "$W/dex"

# ── 1) Recursos ─────────────────────────────────────────────────────────────
step "aapt2 compile (recursos)"
"$AAPT2" compile --dir "$APP/src/main/res" -o "$W/res.zip"
info "res.zip: $(stat -c%s "$W/res.zip") bytes"

# ── 2) APK base ─────────────────────────────────────────────────────────────
# AGP inyecta el atributo `package` desde `namespace`; aapt2 a pelo lo exige,
# asi que trabajamos sobre una COPIA (el manifest original no se toca).
step "aapt2 link (APK base)"
NS="$(grep -oE 'namespace = "[^"]+"' "$GRADLE_FILE" | sed 's/.*"\(.*\)"/\1/')"
NS="${NS:-com.klanly.app}"
sed "s|<manifest |<manifest package=\"$NS\" |" "$APP/src/main/AndroidManifest.xml" > "$W/AndroidManifest.xml"
"$AAPT2" link -o "$W/base.apk" -I "$ANDROID_JAR" \
  --manifest "$W/AndroidManifest.xml" -R "$W/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VCODE" --version-name "$VERSION" --auto-add-overlay
info "base.apk: $(stat -c%s "$W/base.apk") bytes"

# ── 3) Kotlin ───────────────────────────────────────────────────────────────
# Se invoca la clase main del compilador: los .bat fallan por el espacio en la
# ruta del usuario ("C:\Users\Jhon Supelano").
step "kotlinc"
mapfile -t KT_SOURCES < <(find "$APP/src/main/java" -name '*.kt' | while read -r f; do cygpath -w "$f"; done)
[[ ${#KT_SOURCES[@]} -gt 0 ]] || fail "no hay fuentes .kt"
java -cp "$(cygpath -w "$KJAR")" org.jetbrains.kotlin.cli.jvm.K2JVMCompiler \
  "${KT_SOURCES[@]}" \
  -classpath "$(cygpath -w "$ANDROID_JAR")" \
  -jvm-target 17 -nowarn -d "$(cygpath -w "$W/classes")" 2>&1 | grep -viE '^$|warning' || true
N=$(find "$W/classes" -name '*.class' | wc -l)
[[ "$N" -gt 0 ]] || fail "kotlinc no genero clases"
info "$N clases"

# ── 4) Dex ──────────────────────────────────────────────────────────────────
# d8 se ejecuta DESDE el directorio de clases con rutas relativas: asi los
# espacios de la ruta no rompen el paso de argumentos.
step "d8 (classes.dex)"
( cd "$W/classes"
  # shellcheck disable=SC2046
  java -cp "$(cygpath -w "$D8JAR")" com.android.tools.r8.D8 \
    --lib "$(cygpath -w "$ANDROID_JAR")" --min-api 24 --release \
    --output "$(cygpath -w "$W/dex")" \
    $(find . -name '*.class' | sed 's|^\./||') \
    "$(cygpath -w "$STDLIB")" 2>&1 \
    | grep -viE '^$|^Info:|^Warning:|^\s+at |^java\.lang\.Exception|^com\.android\.tools|^Caused by|malformed kotlin.Metadata|Should never be called|rewriting of Kotlin metadata' || true
)
# Nota: d8 emite mucho ruido sobre la metadata de Kotlin del stdlib ("malformed
# kotlin.Metadata", "Should never be called") porque el stdlib es de Kotlin 2.x
# y su parser es mas antiguo. Es inocuo —esa metadata solo la usa la reflexion
# de Kotlin, que esta app no usa— y el dex sale correcto, asi que se filtra.
[[ -f "$W/dex/classes.dex" ]] || fail "d8 no genero classes.dex"
info "classes.dex: $(stat -c%s "$W/dex/classes.dex") bytes"

# ── 5) Empaquetar y alinear ─────────────────────────────────────────────────
step "empaquetar + alinear"
cp "$W/base.apk" "$W/unsigned.apk"
( cd "$W/dex" && jar uf "$(cygpath -w "$W/unsigned.apk")" classes.dex )
"$ZIPALIGN" -f -p 4 "$(cygpath -w "$W/unsigned.apk")" "$(cygpath -w "$W/aligned.apk")"

# ── 6) Firmar ───────────────────────────────────────────────────────────────
step "apksigner (firma de depuracion)"
KS="$HOME/.android/debug.keystore"
if [[ ! -f "$KS" ]]; then
  info "creando debug.keystore"
  keytool -genkeypair -v -keystore "$(cygpath -w "$KS")" -storepass android \
    -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 \
    -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
fi
mkdir -p "$REPO/dist"
FINAL="$REPO/dist/Klanly-$VERSION.apk"
java -jar "$(cygpath -w "$SIGNERJAR")" sign \
  --ks "$(cygpath -w "$KS")" --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android \
  --min-sdk-version 24 --out "$(cygpath -w "$FINAL")" "$(cygpath -w "$W/aligned.apk")"

java -jar "$(cygpath -w "$SIGNERJAR")" verify "$(cygpath -w "$FINAL")" >/dev/null \
  || fail "la firma no verifica"

MB=$(awk "BEGIN{printf \"%.2f\", $(stat -c%s "$FINAL")/1048576}")
printf '\n\033[32m==> APK listo y firmado: %s (%s MB)\033[0m\n' "$FINAL" "$MB"

# Resumen del contenido, para detectar de un vistazo si falta algo
info "$("$AAPT2" dump badging "$(cygpath -w "$FINAL")" 2>/dev/null | grep -m1 '^package')"
info "entradas en el APK: $(unzip -l "$FINAL" | tail -1 | awk '{print $2}')"

# ── 7) Publicar ─────────────────────────────────────────────────────────────
if [[ "$PUBLISH" == "1" ]]; then
  step "publicando en la Release v$VERSION"
  if gh release view "v$VERSION" >/dev/null 2>&1; then
    gh release upload "v$VERSION" "$FINAL" --clobber
  else
    gh release create "v$VERSION" "$FINAL" --title "Klanly v$VERSION" \
      --notes "Compilado en local sin Gradle (aapt2 + kotlinc + d8 + apksigner)."
  fi
  printf '\033[32m==> https://github.com/jhonsu01/klanly/releases/tag/v%s\033[0m\n' "$VERSION"
fi
