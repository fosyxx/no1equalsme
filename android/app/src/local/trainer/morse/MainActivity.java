package local.trainer.morse;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.*;
import org.json.*;

/** Offline WebView shell. Rendering never waits for the background updater. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "morse.local";
    private static final int MAX_DOWNLOAD = 12 * 1024 * 1024;
    private static final long NET_COOLDOWN_MS = 120000;
    private volatile long netBlockedUntil;
    private String remoteBase = "";
    private WebView web;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        getWindow().addFlags(128);
        readRemoteConfig();
        ensureCacheValid();
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#141218"));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return respond(request);
            }
        });
        setContentView(web);
        web.loadUrl("https://morse.local/index.html");
        startUpdateThread();
    }

    private File cacheDir() { return new File(getFilesDir(), "remote"); }

    private WebResourceResponse respond(WebResourceRequest request) {
        if (!ORIGIN.equalsIgnoreCase(request.getUrl().getHost())) {
            return bytes("application/javascript", "/* offline wrapper: external resource ignored */".getBytes(), null);
        }
        String path = request.getUrl().getPath();
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..") || path.indexOf('\\') >= 0) return missing();
        String relative = path.substring(1);
        if (!relative.equals("index.html")) {
            File cached = new File(cacheDir(), relative);
            byte[] data = readValidCache(cached, relative);
            if (data != null) return bytes(mimeFor(path), data, request);
        }
        try {
            return bytes(mimeFor(path), readAll(getAssets().open("www/" + relative), MAX_DOWNLOAD), request);
        } catch (IOException ignored) {
            return missing();
        }
    }

    static byte[] readValidCache(File cached, String relative) {
        if (!cached.isFile()) return null;
        try {
            byte[] data = readAll(new FileInputStream(cached), MAX_DOWNLOAD);
            // A failed or obsolete update must never hide the packaged offline copy.
            if (contentValid(relative, data)) return data;
        } catch (IOException ignored) { }
        cached.delete();
        return null;
    }

    private WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            Collections.<String, String>emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private WebResourceResponse bytes(String mime, byte[] data, WebResourceRequest request) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        headers.put("Accept-Ranges", "bytes");
        int code = 200;
        String reason = "OK";
        String range = null;
        if (request != null) {
            for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
                if (entry.getKey().equalsIgnoreCase("Range")) range = entry.getValue();
            }
        }
        if (range != null && range.startsWith("bytes=") && range.indexOf(',') < 0) {
            try {
                String[] ends = range.substring(6).trim().split("-", -1);
                if (ends.length != 2) throw new NumberFormatException();
                long start, end;
                if (ends[0].isEmpty()) {
                    long length = Long.parseLong(ends[1]);
                    if (length <= 0) throw new NumberFormatException();
                    start = Math.max(0, data.length - length);
                    end = data.length - 1;
                } else {
                    start = Long.parseLong(ends[0]);
                    end = ends[1].isEmpty() ? data.length - 1 : Long.parseLong(ends[1]);
                }
                if (start < 0 || start >= data.length || end < start) {
                    headers.put("Content-Range", "bytes */" + data.length);
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers,
                        new ByteArrayInputStream(new byte[0]));
                }
                end = Math.min(end, data.length - 1);
                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + data.length);
                data = Arrays.copyOfRange(data, (int) start, (int) end + 1);
                code = 206;
                reason = "Partial Content";
            } catch (NumberFormatException ignored) { /* Ignore malformed Range, serve full body. */ }
        }
        headers.put("Content-Length", String.valueOf(data.length));
        String encoding = mime.startsWith("text/") || mime.contains("json") || mime.contains("javascript") ? "UTF-8" : null;
        return new WebResourceResponse(mime, encoding, code, reason, headers, new ByteArrayInputStream(data));
    }

    static byte[] readAll(InputStream source, int maximum) throws IOException {
        try (InputStream in = source; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16384];
            int n;
            while ((n = in.read(buffer)) != -1) {
                if (n == 0) continue;
                if (n > maximum - out.size()) throw new IOException("too big");
                out.write(buffer, 0, n);
            }
            return out.toByteArray();
        }
    }

    static boolean jsonLooksValid(String path, byte[] data) {
        try {
            JSONTokener parser = new JSONTokener(new String(data, "UTF-8").replace("\ufeff", "").trim());
            Object root = parser.nextValue();
            if (parser.nextClean() != 0) return false;
            JSONArray cards;
            boolean words = path.equals("data/words.json");
            boolean languages = path.equals("data/languages.json");
            boolean steno = path.startsWith("data/stenography");
            boolean akopyan = path.equals("data/stenography-akopyan.json");
            if (root instanceof JSONArray && path.equals("data/words.json")) cards = (JSONArray) root;
            else if (root instanceof JSONObject) {
                JSONObject object = (JSONObject) root;
                Object schema = object.opt("schemaVersion");
                if (schema != null && schema != JSONObject.NULL && (!(schema instanceof Number) ||
                    (((Number) schema).doubleValue() != 1 && !(words && ((Number) schema).doubleValue() == 2)))) return false;
                if (!words && (schema == null || schema == JSONObject.NULL)) return false;
                if (!languages && object.has("language") && !object.isNull("language") && !"ru".equals(object.opt("language"))) return false;
                if (!words && !languages && !"ru".equals(object.opt("language"))) return false;
                if (!words && !languages && (!(object.opt("contentVersion") instanceof Number) || object.optDouble("contentVersion") <= 0)) return false;
                if (steno) {
                    JSONObject space = object.optJSONObject("space");
                    if (space == null || space.optInt("size") != 256 || space.optInt("controlY") != 80 ||
                        (space.optInt("baselineY") != 176 && space.optInt("baselineY") != 180)) return false;
                }
                cards = object.optJSONArray("cards");
            } else return false;
            if (cards == null || cards.length() == 0) return false;
            if (languages && cards.length() != 500) return false;
            if (steno && (cards.length() < 8 || cards.length() > 64)) return false;
            Set<String> ids = new HashSet<>();
            Map<String, Integer> perLanguage = new HashMap<>();
            for (int i = 0; i < cards.length(); i++) {
                JSONObject card = cards.optJSONObject(i);
                if (card == null || !hasText(card, "id") || !ids.add(card.optString("id"))) return false;
                if (card.optString("id").length() > 64) return false;
                if (words) {
                    if (!hasText(card, "word") || card.optString("word").trim().length() > 80 ||
                        (!hasText(card, "definitionShort") && !hasText(card, "definitionFull"))) return false;
                } else if (languages) {
                    String language = card.optString("languageId");
                    if (!Arrays.asList("es", "fr", "de", "it", "pt", "zh", "ja", "ko", "ar", "tr").contains(language) ||
                        !hasText(card, "native") || !hasText(card, "translationRu") || !hasText(card, "bcp47") ||
                        !card.optString("audio").matches("\\./assets/languages/audio/lang_[A-Za-z0-9_-]+\\.mp3")) return false;
                    if (Arrays.asList("zh", "ja", "ko", "ar").contains(language) && !hasText(card, "transliteration")) return false;
                    perLanguage.put(language, perLanguage.containsKey(language) ? perLanguage.get(language) + 1 : 1);
                } else {
                    if (!akopyan && !card.optString("letter").matches(steno ? "[А-Я]" : "[А-Яа-яЁё]")) return false;
                    if (steno) {
                        if (!card.optString("id").matches("st_[a-z][a-z0-9]{0,9}") || !hasText(card, "hint") ||
                            card.optString("hint").length() > 240 || card.optString("ambiguityNote", "").length() > 300 ||
                            !relativeMedia(card.optString("svg"), "svg") || !relativeMedia(card.optString("png"), "png")) return false;
                        JSONArray templates = card.optJSONArray("templates");
                        if (templates == null || templates.length() < 1 || templates.length() > 4) return false;
                        for (int t = 0; t < templates.length(); t++) if (!templateValid(templates.optJSONArray(t), akopyan ? 32 : 6)) return false;
                        JSONArray accepted = card.optJSONArray("reverseAcceptedLetters");
                        if (accepted == null || accepted.length() == 0 || accepted.length() > 3) return false;
                        boolean includesLetter = false;
                        for (int a = 0; a < accepted.length(); a++) {
                            if (!(accepted.opt(a) instanceof String) || !accepted.optString(a).matches("[А-ЯЁ]")) return false;
                            if (accepted.optString(a).equals(card.optString("letter"))) includesLetter = true;
                        }
                        if (!akopyan && !includesLetter) return false;
                    } else if (!card.optString("morse").matches("[.\\-]{1,12}") ||
                        !relativeMedia(card.optString("image"), "png|jpg|jpeg|webp")) return false;
                }
            }
            if (languages) for (int count : perLanguage.values()) if (count != 50) return false;
            return true;
        } catch (Exception ignored) { return false; }
    }

    private static boolean hasText(JSONObject object, String key) {
        return object.opt(key) instanceof String && !object.optString(key).trim().isEmpty();
    }
    private static boolean relativeMedia(String path, String extension) {
        return path.length() <= 200 && !path.contains("..") && path.matches("\\./[A-Za-z0-9_./-]+\\.(" + extension + ")");
    }
    private static boolean templateValid(JSONArray strokes, int maximumStrokes) {
        if (strokes == null || strokes.length() < 1 || strokes.length() > maximumStrokes) return false;
        for (int s = 0; s < strokes.length(); s++) {
            JSONArray points = strokes.optJSONArray(s);
            if (points == null || points.length() < 1 || points.length() > 4000) return false;
            for (int p = 0; p < points.length(); p++) {
                JSONArray point = points.optJSONArray(p);
                if (point == null || point.length() < 2) return false;
                for (int axis = 0; axis < 2; axis++) {
                    if (!(point.opt(axis) instanceof Number)) return false;
                    double coordinate = point.optDouble(axis);
                    if (Double.isNaN(coordinate) || Double.isInfinite(coordinate) || coordinate < -10 || coordinate > 266) return false;
                }
            }
        }
        return true;
    }

    private static boolean pngValid(byte[] data) {
        return data.length > 8 && (data[0] & 255) == 137 && data[1] == 80 && data[2] == 78 && data[3] == 71;
    }
    private static boolean audioValid(byte[] data) {
        return data.length >= 128 && ((data[0] == 73 && data[1] == 68 && data[2] == 51) ||
            ((data[0] & 255) == 255 && (data[1] & 224) == 224));
    }
    private static boolean svgValid(byte[] data) {
        try {
            String text = new String(data, "UTF-8").replace("\ufeff", "").trim().toLowerCase(Locale.ROOT);
            return data.length >= 40 && data.length <= 400000 && text.startsWith("<svg") &&
                text.contains("</svg>") && !text.contains("<script") && !text.contains("javascript:");
        } catch (Exception ignored) { return false; }
    }
    private static boolean contentValid(String path, byte[] data) {
        if (path.endsWith(".json")) return jsonLooksValid(path, data);
        if (path.endsWith(".png")) return pngValid(data);
        if (path.endsWith(".svg")) return svgValid(data);
        if (path.endsWith(".mp3")) return audioValid(data);
        return false;
    }

    private void ensureCacheValid() {
        File root = cacheDir();
        File meta = new File(root, "app-update.meta");
        Properties props = loadProps(meta);
        String version = "?";
        try { version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception ignored) { }
        if (!version.equals(props.getProperty("appVersion"))) {
            deleteContents(root);
            root.mkdirs();
            props.clear();
            props.setProperty("appVersion", version);
            saveProps(meta, props);
        }
    }
    private static void deleteContents(File root) {
        File[] files = root.listFiles();
        if (files != null) for (File file : files) { if (file.isDirectory()) deleteContents(file); file.delete(); }
    }
    private static Properties loadProps(File file) {
        Properties props = new Properties();
        try (InputStream in = new FileInputStream(file)) { props.load(in); } catch (IOException ignored) { }
        return props;
    }
    private static void saveProps(File file, Properties props) {
        try (OutputStream out = new FileOutputStream(file)) { props.store(out, "nem cache"); } catch (IOException ignored) { }
    }
    private void readRemoteConfig() {
        try {
            String url = new JSONObject(new String(readAll(getAssets().open("app-update.json"), 4096), "UTF-8")).optString("remote").trim();
            while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
            if (url.startsWith("https://")) remoteBase = url;
        } catch (Exception ignored) { }
    }
    private void startUpdateThread() {
        if (remoteBase.isEmpty()) return;
        Thread worker = new Thread(new Runnable() { @Override public void run() { updateOnce(); } }, "nem-update");
        worker.setDaemon(true);
        worker.start();
    }
    private void updateOnce() {
        File root = cacheDir();
        Properties props = loadProps(new File(root, "app-update.meta"));
        pullInto("data/words.json", props, "json");
        pullInto("data/languages.json", props, "json");
        pullInto("data/morse-signs.json", props, "json");
        pullInto("data/stenography.json", props, "json");
        pullInto("data/stenography-akopyan.json", props, "json");
        int[] remaining = {400};
        pullMissingMedia("data/languages.json", "cards", "audio", ".mp3", props, root, remaining);
        pullMissingMedia("data/morse-signs.json", "cards", "image", ".png", props, root, remaining);
        for (String path : new String[]{"data/stenography.json", "data/stenography-akopyan.json"}) {
            pullMissingMedia(path, "cards", "svg", ".svg", props, root, remaining);
            pullMissingMedia(path, "cards", "png", ".png", props, root, remaining);
        }
        saveProps(new File(root, "app-update.meta"), props);
    }
    private boolean pullInto(String path, Properties props, String kind) {
        if (System.currentTimeMillis() < netBlockedUntil) return false;
        HttpURLConnection connection = null;
        File temporary = null;
        try {
            StringBuilder encoded = new StringBuilder();
            for (String part : path.split("/")) {
                if (encoded.length() > 0) encoded.append('/');
                encoded.append(URLEncoder.encode(part, "UTF-8").replace("+", "%20"));
            }
            connection = (HttpURLConnection) new URL(remoteBase + "/" + encoded).openConnection();
            connection.setConnectTimeout(4000);
            connection.setReadTimeout(9000);
            connection.setRequestProperty("Cache-Control", "no-cache");
            File target = new File(cacheDir(), path);
            String etag = props.getProperty("etag:" + path);
            // Never accept 304 for a missing cache file after corruption recovery.
            if (target.isFile() && etag != null) connection.setRequestProperty("If-None-Match", etag);
            int status = connection.getResponseCode();
            netBlockedUntil = 0;
            if (status != 200) return false;
            byte[] data = readAll(connection.getInputStream(), MAX_DOWNLOAD);
            if (!contentValid(path, data)) return false;
            target.getParentFile().mkdirs();
            temporary = File.createTempFile(target.getName(), ".tmp", target.getParentFile());
            try (OutputStream out = new FileOutputStream(temporary)) { out.write(data); }
            // Android's rename replaces the destination atomically; keep the last good copy on failure.
            if (!temporary.renameTo(target)) throw new IOException("cache rename failed");
            String newEtag = connection.getHeaderField("ETag");
            if (newEtag != null) props.setProperty("etag:" + path, newEtag);
            return true;
        } catch (IOException ignored) {
            netBlockedUntil = System.currentTimeMillis() + NET_COOLDOWN_MS;
            return false;
        } finally {
            if (temporary != null && temporary.exists()) temporary.delete();
            if (connection != null) connection.disconnect();
        }
    }
    private void pullMissingMedia(String path, String collection, String field, String suffix,
            Properties props, File root, int[] remaining) {
        try {
            File file = new File(root, path);
            byte[] data = file.isFile() ? readAll(new FileInputStream(file), MAX_DOWNLOAD)
                : readAll(getAssets().open("www/" + path), MAX_DOWNLOAD);
            JSONArray cards = new JSONObject(new String(data, "UTF-8")).optJSONArray(collection);
            if (cards == null) return;
            for (int i = 0; i < cards.length() && remaining[0] > 0; i++) {
                String media = cards.getJSONObject(i).optString(field).replaceFirst("^\\./", "");
                if (!media.startsWith("assets/") || media.contains("..") || !media.endsWith(suffix)) continue;
                if (new File(root, media).isFile()) continue;
                try (InputStream packaged = getAssets().open("www/" + media)) { continue; }
                catch (IOException missing) { remaining[0]--; pullInto(media, props, suffix.substring(1)); }
            }
        } catch (Exception ignored) { }
    }
    private static String mimeFor(String path) {
        path = path.toLowerCase(Locale.ROOT);
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".webp")) return "image/webp";
        if (path.endsWith(".mp3")) return "audio/mpeg";
        if (path.endsWith(".wav")) return "audio/wav";
        if (path.endsWith(".m4a")) return "audio/mp4";
        if (path.endsWith(".ogg")) return "audio/ogg";
        if (path.endsWith(".woff2")) return "font/woff2";
        return "application/octet-stream";
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onPause() { if (web != null) web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }
}
