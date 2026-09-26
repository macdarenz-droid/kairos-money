package app.kairos.money;

import java.util.ArrayList;
import java.util.List;

/** Which held notices survive the store's cap. Plain Java types only, so it runs in a local JVM test. */
final class NoticeTrim {
    private NoticeTrim() {}

    /** Indexes to keep, in order: the oldest unanswered go first, an answer only when none is unanswered. */
    static List<Integer> keep(List<Boolean> decided, int room) {
        int drop = Math.max(0, decided.size() - Math.max(0, room));
        boolean[] gone = new boolean[decided.size()];
        for (int i = 0; i < decided.size() && drop > 0; i++) if (!decided.get(i)) { gone[i] = true; drop--; }
        for (int i = 0; i < decided.size() && drop > 0; i++) if (!gone[i]) { gone[i] = true; drop--; }
        List<Integer> kept = new ArrayList<>();
        for (int i = 0; i < decided.size(); i++) if (!gone[i]) kept.add(i);
        return kept;
    }
}
