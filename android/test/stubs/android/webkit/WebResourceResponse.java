package android.webkit;

import java.io.InputStream;
import java.util.Map;

public class WebResourceResponse {
    public final String mimeType;
    public final String encoding;
    public final int statusCode;
    public final Map<String, String> headers;
    public final InputStream data;
    public WebResourceResponse(String mime, String encoding, int status, String reason,
            Map<String, String> headers, InputStream data) {
        this.mimeType = mime; this.encoding = encoding; this.statusCode = status;
        this.headers = headers; this.data = data;
    }
}
