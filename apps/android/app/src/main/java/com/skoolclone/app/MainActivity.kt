package com.skoolclone.app

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Actividad principal de SkoolClone (usuario).
 *
 * MVP: carga una UI local (assets/index.html). En produccion, este WebView
 * apuntara a la app web desplegada en Vercel y el checkout de pago se abrira
 * dentro del mismo WebView (patron reciclado del proyecto de rifas).
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val web = WebView(this)
        web.webViewClient = WebViewClient()
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.loadUrl("file:///android_asset/index.html")
        setContentView(web)
    }
}
