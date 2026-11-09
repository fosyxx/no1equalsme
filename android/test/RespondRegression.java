package local.trainer.morse;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.lang.reflect.Method;
import java.nio.file.*;
import java.util.*;

/** Real respond() execution with only Android transport/storage classes replaced. */
public final class RespondRegression {
    private static int checks;
    private static File filesDir;
    private static AssetManager assets;
    public static final class HostActivity extends MainActivity {
        @Override public File getFilesDir() { return filesDir; }
        @Override public AssetManager getAssets() { return assets; }
    }
    private static void check(boolean ok, String message) {
        if (!ok) throw new AssertionError(message);
        checks++;
    }
    private static WebResourceRequest request(final String path, final String range) {
        return new WebResourceRequest() {
            public Uri getUrl() { return Uri.parse("https://morse.local/" + path); }
            public boolean isForMainFrame() { return false; }
            public boolean isRedirect() { return false; }
            public boolean hasGesture() { return false; }
            public String getMethod() { return "GET"; }
            public Map<String, String> getRequestHeaders() {
                return range == null ? Collections.<String,String>emptyMap() : Collections.singletonMap("Range",range);
            }
        };
    }
    private static byte[] body(WebResourceResponse response) throws Exception {
        return MainActivity.readAll(response.data, 13 * 1024 * 1024);
    }
    public static void main(String[] args) throws Exception {
        Path temp = Files.createTempDirectory("nem-respond-");
        try {
            Path packaged = temp.resolve("assets/www/data/words.json");
            Files.createDirectories(packaged.getParent());
            byte[] builtin = Files.readAllBytes(Paths.get(args[0],"data/words.json"));
            Files.write(packaged,builtin);
            filesDir = temp.resolve("files").toFile();
            assets = new AssetManager(temp.resolve("assets").toFile());
            Path cached = temp.resolve("files/remote/data/words.json");
            Files.createDirectories(cached.getParent());
            // SDK Activity constructors are non-executable JVM stubs. Skip construction;
            // respond() only uses getFilesDir/getAssets, supplied by the host above.
            java.lang.reflect.Field unsafeField=sun.misc.Unsafe.class.getDeclaredField("theUnsafe");
            unsafeField.setAccessible(true);
            MainActivity activity = (MainActivity)((sun.misc.Unsafe)unsafeField.get(null)).allocateInstance(HostActivity.class);
            Method respond = MainActivity.class.getDeclaredMethod("respond",WebResourceRequest.class);
            respond.setAccessible(true);
            WebResourceResponse response = (WebResourceResponse)respond.invoke(activity,request("data/words.json",null));
            check(response.statusCode==200 && Arrays.equals(body(response),builtin),"missing cache must serve bundled words");
            for (byte[] bad : new byte[][]{
                "{\"cards\":[{\"id\":\"bad\"}]}".getBytes("UTF-8"),
                new byte[12*1024*1024+1]}) {
                Files.write(cached,bad);
                response=(WebResourceResponse)respond.invoke(activity,request("data/words.json",null));
                check(response.statusCode==200 && Arrays.equals(body(response),builtin),"bad/oversized cache must actually serve bundled words");
                check(!Files.exists(cached),"rejected cache must be discarded");
            }
            byte[] updated="{\"schemaVersion\":1,\"language\":\"ru\",\"cards\":[{\"id\":\"updated\",\"word\":\"новое\",\"definitionShort\":\"значение\"}]}".getBytes("UTF-8");
            Files.write(cached,updated);
            response=(WebResourceResponse)respond.invoke(activity,request("data/words.json",null));
            check(Arrays.equals(body(response),updated),"valid update must supersede packaged words");
            Files.delete(cached);
            Files.createDirectory(cached);
            response=(WebResourceResponse)respond.invoke(activity,request("data/words.json",null));
            check(Arrays.equals(body(response),builtin),"unreadable cache path must serve packaged words");
            response=(WebResourceResponse)respond.invoke(activity,request("data/words.json","bytes=0-9"));
            check(response.statusCode==206 && body(response).length==10 && response.headers.get("Content-Range").startsWith("bytes 0-9/"),"packaged Range response");
            response=(WebResourceResponse)respond.invoke(activity,request("data/missing.json",null));
            check(response.statusCode==404,"absent offline asset returns 404");
            System.out.println("Native respond: "+checks+" checks passed");
        } finally {
            try (java.util.stream.Stream<Path> entries=Files.walk(temp)) {
                entries.sorted(Comparator.reverseOrder()).forEach(file->{try{Files.delete(file);}catch(IOException e){throw new RuntimeException(e);}});
            }
        }
    }
}
