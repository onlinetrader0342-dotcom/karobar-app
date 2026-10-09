package com.karobar.app

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Karobar — thin WebView wrapper around the live PWA.
 * All UI/logic lives in the web app; this APK is only a launcher.
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var errorView: LinearLayout

    companion object {
        const val HOME_URL = "https://karobar-9sta.onrender.com"
        const val HOST = "karobar-9sta.onrender.com"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(R.style.Theme_Karobar)
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true // login token lives in localStorage
            settings.databaseEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val url = request.url.toString()
                    val host = request.url.host ?: ""
                    return if (host == HOST || host.endsWith(".$HOST")) {
                        false // keep inside the app
                    } else {
                        // WhatsApp share, tel:, and other external links -> outside browser/apps
                        try {
                            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                        } catch (_: Exception) {
                        }
                        true
                    }
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        view.visibility = View.GONE
                        errorView.visibility = View.VISIBLE
                    }
                }
            }
        }

        errorView = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            visibility = View.GONE
            setPadding(64, 64, 64, 64)
            addView(TextView(context).apply {
                text = "No internet connection"
                textSize = 20f
                gravity = Gravity.CENTER
            })
            addView(TextView(context).apply {
                text = "Please check your connection and try again."
                gravity = Gravity.CENTER
                setPadding(0, 16, 0, 32)
            })
            addView(Button(context).apply {
                text = "Retry"
                setOnClickListener {
                    errorView.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    webView.loadUrl(HOME_URL)
                }
            })
        }

        root.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        root.addView(
            errorView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL)
        } else {
            webView.restoreState(savedInstanceState)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) webView.saveState(outState)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}
