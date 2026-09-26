package app.kairos.money;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Which held notices survive a change of watched apps. Pure, so it runs in a local JVM test. */
final class NoticeSources {
    private NoticeSources() {}

    /** Positions of the notices whose app is still watched, in their original order. */
    static List<Integer> keep(List<String> sources, Collection<String> watched) {
        List<Integer> kept = new ArrayList<>();
        for (int i = 0; i < sources.size(); i++) if (sources.get(i) != null && watched.contains(sources.get(i))) kept.add(i);
        return kept;
    }
}
