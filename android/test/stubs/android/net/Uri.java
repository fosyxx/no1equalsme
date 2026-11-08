package android.net;

public class Uri {
    private final java.net.URI value;
    private Uri(String value) { this.value = java.net.URI.create(value); }
    public static Uri parse(String value) { return new Uri(value); }
    public String getHost() { return value.getHost(); }
    public String getPath() { return value.getPath(); }
}
