import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Properties;
import java.util.TreeMap;
import java.util.prefs.AbstractPreferences;
import java.util.prefs.BackingStoreException;
import java.util.prefs.Preferences;
import java.util.prefs.PreferencesFactory;

/** RARS's settings (java.util.prefs) kept in this engine's own folder and
 *  nowhere else.  Lab PCs are shared, one account for everyone, and every
 *  start is to begin from the same defaults; but the JDK's own backends keep
 *  settings for good -- on Windows in the registry
 *  (HKCU\Software\JavaSoft\Prefs, which no system property moves), on Linux
 *  and macOS in a folder that java.util.prefs.userRoot can at least point
 *  somewhere -- so one student's RARS settings were the next one's.
 *
 *  -Djava.util.prefs.PreferencesFactory=StudioPrefs (electron/src/isa/riscv/sim/transport.ts)
 *  puts this in their place on every platform.  The folder is
 *  java.util.prefs.userRoot, which the app gives each engine on its own
 *  (rars-prefs-main, rars-prefs-checker: two JVMs never share a folder) in
 *  the run's folder, which the app removes when it ends; a node is a folder
 *  under it, its keys one properties file.  Nothing else is written.
 *  RARS itself is not changed: it asks Preferences, and this is what answers. */
public final class StudioPrefs implements PreferencesFactory {
    static final Path DIR = Paths.get(System.getProperty("java.util.prefs.userRoot",
        Paths.get(System.getProperty("java.io.tmpdir"), "studio-prefs-" + ProcessHandle.current().pid()).toString()));
    private static final Preferences USER = new Node(null, "", DIR.resolve("user"));
    private static final Preferences SYSTEM = new Node(null, "", DIR.resolve("system"));

    @Override public Preferences userRoot() { return USER; }
    @Override public Preferences systemRoot() { return SYSTEM; }

    private static final class Node extends AbstractPreferences {
        private static final String FILE = "prefs.properties";
        private final Path dir;
        private final TreeMap<String, String> values = new TreeMap<>();

        Node(Node parent, String name, Path dir) {
            super(parent, name);
            this.dir = dir;
            Path f = dir.resolve(FILE);
            if (Files.isRegularFile(f)) {
                Properties p = new Properties();
                try (InputStream in = Files.newInputStream(f)) { p.load(in); } catch (IOException e) { /* an unreadable file is an empty node */ }
                for (String k : p.stringPropertyNames()) values.put(k, p.getProperty(k));
            }
        }

        private static String encode(String name) { return URLEncoder.encode(name, StandardCharsets.UTF_8); }

        @Override protected void putSpi(String key, String value) { values.put(key, value); }
        @Override protected String getSpi(String key) { return values.get(key); }
        @Override protected void removeSpi(String key) { values.remove(key); }
        @Override protected String[] keysSpi() { return values.keySet().toArray(new String[0]); }
        @Override protected AbstractPreferences childSpi(String name) { return new Node(this, name, dir.resolve(encode(name))); }

        @Override protected String[] childrenNamesSpi() throws BackingStoreException {
            if (!Files.isDirectory(dir)) return new String[0];
            java.util.List<String> names = new java.util.ArrayList<>();
            try (DirectoryStream<Path> ds = Files.newDirectoryStream(dir, Files::isDirectory)) {
                for (Path p : ds) names.add(URLDecoder.decode(p.getFileName().toString(), StandardCharsets.UTF_8));
            } catch (IOException e) { throw new BackingStoreException(e); }
            return names.toArray(new String[0]);
        }

        @Override protected void removeNodeSpi() throws BackingStoreException {
            try { Files.deleteIfExists(dir.resolve(FILE)); Files.deleteIfExists(dir); }
            catch (IOException e) { throw new BackingStoreException(e); }
        }

        @Override protected void syncSpi() throws BackingStoreException { flushSpi(); }

        @Override protected void flushSpi() throws BackingStoreException {
            if (isRemoved()) return;
            try {
                if (values.isEmpty()) { Files.deleteIfExists(dir.resolve(FILE)); return; }
                Files.createDirectories(dir);
                Properties p = new Properties();
                p.putAll(values);
                try (OutputStream out = Files.newOutputStream(dir.resolve(FILE))) { p.store(out, null); }
            } catch (IOException e) { throw new BackingStoreException(e); }
        }
    }
}
