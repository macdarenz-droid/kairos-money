package app.kairos.money;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

/** Which held notices survive a change of watched apps. Pure, so it runs in a local JVM test. */
final class NoticeSources {
    private NoticeSources() {}

    /** Positions of the notices whose app is still watched, in their original order. */
    static List<Integer> keep(List<String> sources, Collection<String> watched) {
        return keep(sources, java.util.Collections.<String>nCopies(sources.size(), null), watched);
    }

    /** As above, but an approved notice stays until the next unlock records it, whatever its app. */
    static List<Integer> keep(List<String> sources, List<String> decisions, Collection<String> watched) {
        List<Integer> kept = new ArrayList<>();
        for (int i = 0; i < sources.size(); i++)
            if ((sources.get(i) != null && watched.contains(sources.get(i))) || "approved".equals(decisions.get(i))) kept.add(i);
        return kept;
    }
}
