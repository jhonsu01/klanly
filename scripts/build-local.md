# Compilar Klanly en local (sin GitHub Actions)

Se superaron los limites de minutos de GitHub Actions, asi que
`.github/workflows/release.yml` **ya no se dispara al empujar un tag**. Solo
corre si lo lanzas a mano desde la pestana *Actions -> Release -> Run workflow*.

Las compilaciones se hacen ahora en tu maquina y el binario se sube a la
Release del repositorio.

---

## Antes de nada: normalmente NO necesitas recompilar

El `.apk` es un **WebView sobre `https://klanly.vercel.app`**, y el `.msi` de
escritorio carga `https://klanly.vercel.app/admin`. Es decir:

| Que cambiaste                                  | Necesitas recompilar? |
| ---------------------------------------------- | --------------------- |
| Diseno, pantallas, textos, API, base de datos  | **No.** Basta con hacer push: Vercel despliega y las apps lo toman al recargar. |
| `apps/android/**` (Kotlin, permisos, manifest) | Si, el `.apk`.        |
| `apps/admin-windows/**` (Tauri, Rust)          | Si, el `.msi`.        |
| Version del release / iconos                   | Si, el binario afectado. |

---

## APK de Android

### Requisitos (una sola vez)

1. **JDK 17 o 21**

   ```powershell
   winget install EclipseAdoptium.Temurin.21.JDK
   ```

2. **Android SDK** — lo mas simple es instalar Android Studio. Si prefieres solo
   la linea de comandos, descarga las *command line tools* y luego:

   ```powershell
   sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
   ```

3. **Variable de entorno** apuntando al SDK:

   ```powershell
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   ```

   Para dejarla fija en el sistema:

   ```powershell
   [Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
   ```

### Compilar

```powershell
.\scripts\build-apk.ps1
```

El APK queda en `dist\Klanly-<version>.apk`. Con `-Version` compilas otra
version y con `-Publish` se sube a la Release del tag `vX.Y.Z` (la crea si no
existe) usando `gh`:

```powershell
.\scripts\build-apk.ps1 -Version 0.7.0 -Publish
```

### Publicar a mano (si no usas -Publish)

```powershell
gh release create v0.7.0 dist\Klanly-0.7.0.apk --title "Klanly v0.7.0" --notes "Compilado en local."
```

O arrastrando el archivo en <https://github.com/jhonsu01/klanly/releases/new>.

---

## MSI de escritorio (solo si tocas `apps/admin-windows`)

```powershell
cd apps\admin-windows
npm install
npx tauri build
```

El instalador queda en
`apps\admin-windows\src-tauri\target\release\bundle\msi\*.msi`. Se publica igual:

```powershell
gh release upload v0.7.0 (Get-ChildItem apps\admin-windows\src-tauri\target\release\bundle\msi\*.msi)[0].FullName --clobber
```

---

## Problemas conocidos

**`java.io.IOException: Unable to establish loopback connection`**

Gradle bifurca un proceso demonio y algo lo esta matando. Causas habituales:

- Antivirus o firewall bloqueando el proceso hijo de Java -> anade una
  exclusion para la carpeta `~/.gradle` y para `java.exe` del JDK.
- Ejecutarlo dentro de un entorno que limpia procesos hijos (por ejemplo un
  agente automatizado). **Ejecutalo desde tu propia terminal de PowerShell.**
- Demonios zombis de una ejecucion anterior:

  ```powershell
  Get-Process java -ErrorAction SilentlyContinue | Stop-Process -Force
  Remove-Item "$env:USERPROFILE\.gradle\daemon" -Recurse -Force
  ```

**`SDK location not found`** — falta `ANDROID_HOME`. El script escribe
`apps/android/local.properties` automaticamente cuando la variable existe.

**El APK instala pero se ve la version vieja** — es cache del WebView. Cierra la
app por completo y vuelve a abrirla, o borra sus datos en
*Ajustes -> Aplicaciones -> Klanly -> Almacenamiento*.
