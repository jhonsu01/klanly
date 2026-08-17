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

        // Sin esto el WebView puede no recibir las pulsaciones del mando y los
        // botones de la pagina quedan inalcanzables.
        web.isFocusable = true
        web.isFocusableInTouchMode = true

        web.loadUrl(TV_URL)
        setContentView(web)
        web.requestFocus()
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
     * El mando NO recarga la página.
     *
     * Recargar volvía a registrar la pantalla y, hasta que se guardó su
     * identidad, eso cambiaba el PIN: el celular seguía enviando al canal
     * viejo y aquí no aparecía nada. Ahora la identidad se conserva, pero de
     * todas formas no hay motivo para recargar con el mando: el control real
     * está en el celular. Solo se deja MENU como recarga manual de emergencia.
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return when (keyCode) {
            KeyEvent.KEYCODE_MENU -> { web.reload(); true }
            // OK / ENTER / flechas NO se interceptan: la pagina tiene botones
            // (por ejemplo "Emparejar otro dispositivo") y el mando debe poder
            // moverse entre ellos y pulsarlos. Interceptarlos los dejaba
            // inservibles.
            else -> super.onKeyDown(keyCode, event)
        }
    }

    /**
     * Atrás sale de la app (comportamiento normal en Android TV). No recarga:
     * al volver a abrirla, la pantalla recupera su identidad y su canal, así
     * que el emparejamiento del celular sigue sirviendo.
     */
    @Deprecated("Atrás cierra la app, como espera el usuario en un televisor")
    override fun onBackPressed() {
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }
}
