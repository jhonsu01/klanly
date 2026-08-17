package com.klanly.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Klanly TV — pantalla de entrenamiento para el televisor.
 *
 * Carga /tv de la web en vivo. Esa página pide un PIN al servidor, lo muestra
 * en grande y espera: cuando el alumno lo escribe en el celular, recibe la
 * lección y la reproduce.
 *
 * Por qué es tan simple: la TV solo MUESTRA. No hay que navegar con el mando
 * (no hay listas ni menús que recorrer), así que no hace falta leanback ni
 * androidx: basta un WebView a pantalla completa. Eso mantiene el APK diminuto
 * y sin dependencias, igual que la app del celular.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView

    companion object {
        const val TV_URL = "https://klanly.vercel.app/tv"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Nadie toca la pantalla durante una serie: no debe apagarse.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        pantallaCompleta()

        web = WebView(this)
        web.webViewClient = WebViewClient()
        // Los videos necesitan un WebChromeClient para el modo pantalla completa
        web.webChromeClient = WebChromeClient()
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.databaseEnabled = true
        web.settings.mediaPlaybackRequiresUserGesture = false // autoplay del entrenamiento
        web.settings.loadWithOverviewMode = true
        web.settings.useWideViewPort = true
        web.setBackgroundColor(0xFF08080A.toInt())  // fondo Nocturno, sin destello

        web.loadUrl(TV_URL)
        setContentView(web)
    }

    /** Oculta las barras del sistema: la TV es una pantalla, no un escritorio. */
    private fun pantallaCompleta() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) pantallaCompleta()
    }

    /**
     * El mando solo sirve para recargar (por si la TV arrancó sin red) y salir.
     * El resto del control está en el celular, que es el mando de verdad.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> {
                web.reload(); true
            }
            else -> super.onKeyDown(keyCode, event)
        }
    }

    @Deprecated("Atrás recarga; para salir se usa el botón Inicio del mando")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else web.loadUrl(TV_URL)
    }
}
