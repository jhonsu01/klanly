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

Diagnostico real de esta maquina (2026-08-12). El error del cliente es solo el
sintoma; la causa esta en el log del demonio
(`~/.gradle/daemon/8.9/daemon-*.out.log`):

```
[ERROR] [org.gradle.internal.remote.internal.inet.TcpIncomingConnector]
        Could not accept remote connection.
Caused by: java.net.SocketException: Invalid argument: connect
```

El demonio arranca, reserva su puerto en `127.0.0.1` y muere a los ~240 ms
porque el `accept()` falla con *Invalid argument*. Es un problema del **stack de
red de Windows**, no de Gradle ni del proyecto: hay filtros Winsock/NDIS de
VirtualBox y adaptadores virtuales de Hyper-V enlazados a todas las interfaces
(se ven enumerados en ese mismo log).

Ya se descarto (todo probado, todo falla igual):

- `--no-daemon` -> en JDK 21 Gradle **siempre** bifurca un demonio de un solo
  uso, porque necesita los `--add-opens`. No se puede evitar.
- Comentar `org.gradle.jvmargs` en `gradle.properties`.
- `-Djava.net.preferIPv4Stack=true`.
- Lanzarlo desacoplado con `Start-Process` (no era el shell padre matandolo).
- `GRADLE_USER_HOME` nuevo y borrar `~/.gradle/daemon` (registro corrupto).
- Un test de loopback en Java puro **si funciona** (bind + connect a 127.0.0.1),
  asi que el loopback en general esta bien: lo que rompe es el `accept()` del
  demonio bajo esos filtros de red.

### Que probar, por orden de probabilidad

1. **Reiniciar Winsock** (el remedio estandar para *Invalid argument* por LSPs).
   PowerShell **como administrador** y despues **reiniciar el equipo**:

   ```powershell
   netsh winsock reset
   netsh int ip reset
   ```

2. **Compilar desde Android Studio** (Build > Build APK). Usa su propio JDK
   embebido y su gestion del demonio; suele pasar por alto el problema.

3. **Desactivar temporalmente los adaptadores virtuales** que meten filtros
   (VirtualBox Host-Only, Hyper-V Virtual Switch) desde
   *Conexiones de red*, compilar, y volver a activarlos.

4. **Excluir de antivirus/firewall** la carpeta `%USERPROFILE%\.gradle` y el
   `java.exe` del JDK.

5. Si nada funciona: lanzar el workflow **una sola vez** a mano desde
   *Actions -> Release -> Run workflow* (consume minutos, pero es un unico uso).

**`SDK location not found`** — falta `ANDROID_HOME`. El script escribe
`apps/android/local.properties` automaticamente cuando la variable existe.

**El APK instala pero se ve la version vieja** — es cache del WebView. Cierra la
app por completo y vuelve a abrirla, o borra sus datos en
*Ajustes -> Aplicaciones -> Klanly -> Almacenamiento*.
