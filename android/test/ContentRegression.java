package local.trainer.morse;

import java.io.*;
import java.nio.file.*;
import java.util.Arrays;

/** Run on a regular JDK with android.jar and org.json on the classpath. */
public final class ContentRegression {
    private static int assertions;
    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        assertions++;
    }
    private static byte[] utf8(String value) throws Exception { return value.getBytes("UTF-8"); }
    public static void main(String[] args) throws Exception {
        Path root = Paths.get(args[0]);
        for (String name : new String[]{"words", "morse-signs", "languages", "stenography", "stenography-akopyan"}) {
            check(MainActivity.jsonLooksValid("data/" + name + ".json", Files.readAllBytes(root.resolve("data/" + name + ".json"))),
                "bundled dataset rejected: " + name);
        }
        String valid = "{\"schemaVersion\":1,\"cards\":[{\"id\":\"one\",\"word\":\"слово\",\"definitionShort\":\"значение\"}]}";
        for (String invalid : new String[]{"<html>offline</html>", "{", "{\"cards\":[]}",
                "{\"cards\":[{\"id\":\"one\"}]}",
                "{\"cards\":[{\"id\":\"one\",\"word\":\"слово\"}]}",
                valid.replace("\"schemaVersion\":1", "\"schemaVersion\":3"),
                valid.replace("\"schemaVersion\":1", "\"schemaVersion\":\"1\""),
                valid.replace("\"schemaVersion\":1", "\"language\":\"en\""),
                valid + "garbage",
                valid.replace("]}", ",{\"id\":\"two\"}]}"),
                valid.replace("]}", ",{\"id\":\"one\",\"word\":\"дубль\",\"definitionFull\":\"значение\"}]}" )}) {
            check(!MainActivity.jsonLooksValid("data/words.json", utf8(invalid)), "invalid words accepted: " + invalid);
        }
        check(MainActivity.jsonLooksValid("data/words.json", utf8(valid.replace("\"schemaVersion\":1", "\"schemaVersion\":2"))), "supported words schema 2 rejected");
        Path cache = Files.createTempDirectory("nem-native-test-");
        File file = cache.resolve("words.json").toFile();
        check(MainActivity.readValidCache(file, "data/words.json") == null, "missing cache must use packaged data");
        Files.write(file.toPath(), utf8(valid));
        check(Arrays.equals(MainActivity.readValidCache(file, "data/words.json"), utf8(valid)), "valid cache not returned");
        Files.write(file.toPath(), utf8("{\"cards\":[{\"id\":\"poisoned\"}]}"));
        check(MainActivity.readValidCache(file, "data/words.json") == null && !file.exists(),
            "schema-invalid native update must be removed, allowing packaged fallback");
        Files.write(file.toPath(), new byte[12 * 1024 * 1024 + 1]);
        check(MainActivity.readValidCache(file, "data/words.json") == null && !file.exists(), "oversized cache must fall back");
        byte[] large = new byte[40000];
        Arrays.fill(large, (byte) 7);
        check(Arrays.equals(MainActivity.readAll(new ByteArrayInputStream(large), large.length), large), "multi-chunk reading corrupted");
        final boolean[] closed = {false};
        try {
            MainActivity.readAll(new ByteArrayInputStream(large) {
                @Override public void close() { closed[0] = true; }
            }, 100);
            throw new AssertionError("size limit ignored");
        } catch (IOException expected) { check(closed[0], "oversized input stream leaked"); }
        Files.delete(cache);
        System.out.println("Native content: " + assertions + " checks passed");
    }
}
