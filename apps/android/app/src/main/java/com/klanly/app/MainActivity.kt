package com.klanly.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Actividad principal de Klanly (app de usuario).
 *
 * Carga la web en vivo (desplegada en Vercel) dentro de un WebView. El checkout
 * y todo el flujo (auth, comunidades, feed, classroom, pago manual) corren desde
 * la misma app web. Si en el futuro se quiere modo offline, se puede empaquetar
 * un bundle local como fallback.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    /** Callback pendiente del <input type="file"> de la web. */
    private var filePathCallback: android.webkit.ValueCallback<Array<Uri>>? = null

    companion object {
        const val APP_URL = "https://klanly.vercel.app"
        private const val REQ_FILE_CHOOSER = 1001
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)

        // La navegación de Klanly se queda dentro del WebView, pero los enlaces
        // a otros sitios (material complementario de las lecciones, YouTube,
        // etc.) se abren en el navegador del teléfono.
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: android.webkit.WebResourceRequest?,
            ): Boolean {
                val url = request?.url ?: return false
                val host = url.host ?: return false
                val scheme = url.scheme ?: ""

                // Dentro de la app: la propia web de Klanly
                if (host.endsWith("klanly.vercel.app")) return false

                // Fuera: http(s) a otros dominios, y esquemas del sistema
                // (mailto:, tel:, whatsapp:, intent:, market:, …)
                return if (scheme == "http" || scheme == "https" || scheme.isNotEmpty()) {
                    openExternally(url)
                } else {
                    false
                }
            }
        }
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        web.settings.allowFileAccess = true
        // Necesario para capturar los enlaces con target="_blank" (el material
        // complementario de las lecciones) y mandarlos al navegador.
        web.settings.setSupportMultipleWindows(true)
        web.settings.javaScriptCanOpenWindowsAutomatically = true

        // Sin un WebChromeClient que implemente onShowFileChooser, el
        // <input type="file"> de la web NO hace nada dentro de un WebView:
        // por eso no se abría el explorador para adjuntar el comprobante.
        web.webChromeClient = object : WebChromeClient() {
            /**
             * Un enlace con target="_blank" pide una "ventana nueva". Como no
             * abrimos ventanas dentro de la app, interceptamos su URL con un
             * WebView temporal y la mandamos al navegador del teléfono.
             */
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?,
            ): Boolean {
                val temp = WebView(this@MainActivity)
                temp.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(
                        v: WebView?,
                        request: android.webkit.WebResourceRequest?,
                    ): Boolean {
                        request?.url?.let { openExternally(it) }
                        temp.destroy()
                        return true
                    }
                }
                (resultMsg?.obj as? WebView.WebViewTransport)?.webView = temp
                resultMsg?.sendToTarget()
                return true
            }

            override fun onShowFileChooser(
                view: WebView?,
                callback: android.webkit.ValueCallback<Array<Uri>>?,
                params: FileChooserParams?,
            ): Boolean {
                // Cancela cualquier selección anterior que quedara colgada.
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                return try {
                    val intent = params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "image/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                    startActivityForResult(
                        Intent.createChooser(intent, "Selecciona la imagen"),
                        REQ_FILE_CHOOSER,
                    )
                    true
                } catch (e: Exception) {
                    filePathCallback = null
                    false
                }
            }
        }

        web.loadUrl(APP_URL)
        setContentView(web)
    }

    /**
     * Abre una URL fuera de la app. Devuelve true si se pudo delegar al
     * sistema (así el WebView no la carga), false si no hay app que la maneje.
     */
    private fun openExternally(url: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            true
        } catch (e: Exception) {
            android.widget.Toast
                .makeText(this, "No hay una app para abrir este enlace", android.widget.Toast.LENGTH_SHORT)
                .show()
            true // igualmente evitamos cargarlo dentro de Klanly
        }
    }

    @Deprecated("Resultado del selector de archivos del WebView")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_FILE_CHOOSER) return

        val callback = filePathCallback ?: return
        filePathCallback = null

        if (resultCode != RESULT_OK || data == null) {
            callback.onReceiveValue(null) // el usuario canceló
            return
        }

        // Puede venir una sola imagen (data) o varias (clipData).
        val uris: Array<Uri>? = data.clipData?.let { clip ->
            Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
        } ?: data.data?.let { arrayOf(it) }

        callback.onReceiveValue(uris)
    }

    @Deprecated("Back navigation dentro del WebView")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) {
            web.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }
}
