export type MoneyAnswer = {key: string; question: string; answer: string; detail?: string; evidence: string[]};

/**
 * What thirty-six measures add up to, as answers to the questions a person actually has.
 *
 * This replaces two things that were the same mistake twice. First a roll-call: thirty-six rows, each
 * printing its own title and its own status, which on a thin ledger meant thirty-six copies of "not enough
 * evidence yet". Then a readiness grid — "12 of 36" — which was shorter but still an answer to the wrong
 * question. Both told the owner about the app's inventory. Neither told him anything about his money, and
 * he said so: "those 36 things should be a concept, into one visualisation that makes the app more
 * intelligent, not showing me line one of the 36, line two of the 36."
 *
 * So the measures stopped being the subject. They are the engine; these are the four things the engine is
 * for — where the money goes, what repeats, when it leaves, what survives the month. Each is one measure's
 * finding, stated as its answer rather than as its name and status.
 *
 * A question with nothing behind it is absent, not listed as pending. An empty row that explains its own
 * emptiness is how the roll-call grew in the first place: the app has no business reporting on itself, and
 * "we cannot say" repeated four times is still a wall. When none can be answered the block says one short
 * thing and stops.
 *
 * The evidence is not lost — every answer opens the transactions behind it, which is the one route the
 * roll-call was genuinely providing and the only part worth keeping.
 */
export function MoneyAnswers({answers, onEvidence}: {
  answers: readonly MoneyAnswer[];
  onEvidence?: (answer: MoneyAnswer) => void;
}) {
  if (!answers.length) return <p className="meta">Not enough imported history yet to say what your money does.</p>;

  return <section className="answers" aria-label="What your money does">
    {answers.map(answer => {
      const body = <>
        <span className="answer-question">{answer.question}</span>
        <span className="answer-value">{answer.answer}</span>
        {answer.detail && <span className="meta">{answer.detail}</span>}
      </>;
      // Pressable only when there is something behind it. A control that opens an empty sheet is worse
      // than a plain block, because it promises evidence the app does not have.
      return answer.evidence.length && onEvidence
        ? <button key={answer.key} type="button" className="answer-card" onClick={() => onEvidence(answer)}>{body}</button>
        : <div key={answer.key} className="answer-card">{body}</div>;
    })}
  </section>;
}
