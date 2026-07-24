package com.klanly.app

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
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

    companion object {
        const val APP_URL = "https://klanly.vercel.app"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.webViewClient = WebViewClient() // mantiene la navegación dentro del WebView
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        web.loadUrl(APP_URL)
        setContentView(web)
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
