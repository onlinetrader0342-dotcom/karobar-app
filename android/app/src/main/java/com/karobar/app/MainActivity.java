package com.karobar.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Karobar — thin WebView wrapper around the live PWA.
 * All UI/logic lives in the web app; this APK is only a launcher.
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://karobar-9sta.onrender.com";
    private static final String HOST = "karobar-9sta.onrender.com";

    private WebView webView;
    private LinearLayout errorView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        setTheme(R.style.Theme_Karobar);
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true); // login token lives in localStorage
        webView.getSettings().setDatabaseEnabled(true);
        webView.getSettings().setLoadWithOverviewMode(true);
        webView.getSettings().setUseWideViewPort(true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String host = request.getUrl().getHost();
                if (host == null) host = "";
                if (host.equals(HOST) || host.endsWith("." + HOST)) {
                    return false; // keep inside the app
                }
                // WhatsApp share, tel:, and other external links -> outside browser/apps
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    view.setVisibility(View.GONE);
                    errorView.setVisibility(View.VISIBLE);
                }
            }
        });

        errorView = new LinearLayout(this);
        errorView.setOrientation(LinearLayout.VERTICAL);
        errorView.setGravity(Gravity.CENTER);
        errorView.setVisibility(View.GONE);
        errorView.setPadding(64, 64, 64, 64);

        TextView title = new TextView(this);
        title.setText("No internet connection");
        title.setTextSize(20f);
        title.setGravity(Gravity.CENTER);
        errorView.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Please check your connection and try again.");
        sub.setGravity(Gravity.CENTER);
        sub.setPadding(0, 16, 0, 32);
        errorView.addView(sub);

        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setOnClickListener(v -> {
            errorView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
            webView.loadUrl(HOME_URL);
        });
        errorView.addView(retry);

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(errorView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
