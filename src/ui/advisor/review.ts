import {summary} from '../../brain';
import type {Brain, BrainSummary} from '../../brain/types';
import type {Options, Point, Result} from '../../core/net/claude';
import {logCall, type Run} from './sort';

/** What a review or question sends: the brain's summary, with merchant names only if the owner allowed them. */
export async function sentSummary(run: Run, brain: Brain): Promise<BrainSummary> {
  const settings = await run(repo => repo.advisor.settings());
  return summary(brain, {merchantNames: settings.merchantNames});
}

/** "Money review" when `question` is null, otherwise "Ask Kairos". Every call is logged; failures change nothing. */
export async function consult(run: Run, brain: Brain, question: string | null, options: Options = {}): Promise<Result<Point[]> | {ok: false; reason: 'setup'; usage: null}> {
  const {settings, key} = await run(async repo => ({settings: await repo.advisor.settings(), key: await repo.advisor.key()}));
  if (!settings.enabled || !key) return {ok: false, reason: 'setup', usage: null};
  const sent = summary(brain, {merchantNames: settings.merchantNames});
  const claude = await import('../../core/net/claude');
  const result = question === null ? await claude.review(sent, key, settings.model, options) : await claude.ask(sent, question, key, settings.model, options);
  await logCall(run, result, settings.model);
  return result;
}
