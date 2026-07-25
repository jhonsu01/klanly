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
        web.webViewClient = WebViewClient() // mantiene la navegación dentro del WebView
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        web.settings.allowFileAccess = true

        // Sin un WebChromeClient que implemente onShowFileChooser, el
        // <input type="file"> de la web NO hace nada dentro de un WebView:
        // por eso no se abría el explorador para adjuntar el comprobante.
        web.webChromeClient = object : WebChromeClient() {
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
