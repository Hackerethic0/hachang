package th.hachang.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.webkit.*;
import android.widget.*;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

/** แอปห่อหน้าเว็บ "หาช่าง" (WebView) สำหรับทดสอบบน Android: ตั้งที่อยู่เซิร์ฟเวอร์ได้ในครั้งแรก */
public class MainActivity extends AppCompatActivity {
    private static final String DEFAULT_URL = "http://10.0.2.2:3000"; // 10.0.2.2 = คอมพิวเตอร์เครื่องที่รันอีมูเลเตอร์
    private WebView web; private View err; private ProgressBar bar; private TextView errUrl;
    private SharedPreferences prefs;
    private ValueCallback<Uri[]> fileCb;
    private GeolocationPermissions.Callback geoCb; private String geoOrigin;
    private static final int REQ_FILE = 11, REQ_LOC = 12, REQ_MIC = 13;
    private PermissionRequest micReq;
    private boolean failed = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        setContentView(R.layout.activity_main);
        prefs = getSharedPreferences("hc", MODE_PRIVATE);
        web = findViewById(R.id.web); err = findViewById(R.id.err); bar = findViewById(R.id.bar); errUrl = findViewById(R.id.errUrl);
        findViewById(R.id.retry).setOnClickListener(v -> load());
        findViewById(R.id.change).setOnClickListener(v -> askUrl());
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setGeolocationEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); s.setAllowFileAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        web.addJavascriptInterface(new Object() {   // เรียกจากหน้าเว็บ: AndroidBridge.setSpeaker(true/false) สลับลำโพง/หูฟังสนทนาจริง
            @JavascriptInterface public void setSpeaker(boolean on) {
                runOnUiThread(() -> { AudioManager am = (AudioManager) getSystemService(AUDIO_SERVICE);
                    if (on || am.getMode() != AudioManager.MODE_NORMAL) { am.setMode(on ? AudioManager.MODE_IN_COMMUNICATION : AudioManager.MODE_NORMAL); }
                    am.setSpeakerphoneOn(on); });
            }
        }, "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String u, Bitmap f) { failed = false; bar.setVisibility(View.VISIBLE); }
            @Override public void onPageFinished(WebView v, String u) { bar.setVisibility(View.GONE); if (!failed) err.setVisibility(View.GONE); }
            @Override public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) { failed = true; errUrl.setText(baseUrl()); err.setVisibility(View.VISIBLE); }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl(); Uri base = Uri.parse(baseUrl());
                if (u.getHost() != null && u.getHost().equals(base.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) {}
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) { bar.setProgress(p); }
            @Override public void onPermissionRequest(PermissionRequest r) {   // ไมโครโฟนสำหรับรับสาย
                boolean wantsMic = false; for (String x : r.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(x)) wantsMic = true;
                if (!wantsMic) { r.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); return; }
                micReq = r; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { cb.invoke(origin, true, false); return; }
                geoCb = cb; geoOrigin = origin;
                requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOC);
            }
        });
        if (prefs.getString("url", null) == null) askUrl(); else load();
    }
    private String baseUrl() { return prefs.getString("url", DEFAULT_URL); }
    private void load() { err.setVisibility(View.GONE); web.loadUrl(baseUrl()); }
    private void askUrl() {
        EditText e = new EditText(this); e.setInputType(InputType.TYPE_TEXT_VARIATION_URI); e.setText(baseUrl()); e.setSelectAllOnFocus(true);
        FrameLayout box = new FrameLayout(this); box.setPadding(48, 16, 48, 0); box.addView(e);
        new AlertDialog.Builder(this).setTitle("ที่อยู่เซิร์ฟเวอร์")
            .setMessage("อีมูเลเตอร์: http://10.0.2.2:3000\nมือถือจริง: http://IP-ของคอมพิวเตอร์:3000 (แสดงตอนรัน start-phone.bat)")
            .setView(box).setCancelable(prefs.getString("url", null) != null)
            .setPositiveButton("ตกลง", (d, w) -> {
                String u = e.getText().toString().trim();
                if (!u.startsWith("http")) u = "http://" + u;
                prefs.edit().putString("url", u.replaceAll("/+$", "")).apply(); load();
            }).show();
    }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) { fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data)); fileCb = null; }
        else super.onActivityResult(req, res, data);
    }
    @Override public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        if (req == REQ_MIC && micReq != null) { if (r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED) micReq.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); else micReq.deny(); micReq = null; return; }
        if (req == REQ_LOC && geoCb != null) { geoCb.invoke(geoOrigin, r.length > 0 && r[0] == PackageManager.PERMISSION_GRANTED, false); geoCb = null; }
    }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
