import type {Currency} from '../../core/money';
import type {Window} from '../../intelligence/model';
import type {AnalysisIndex,Metric,MetricKey,Observation} from '../model';

/**
 * The six quiet-coaching concepts.
 *
 * Every statement here is declarative and describes what the ledger shows. The Observation type carries no
 * action, prompt, question or acceptance field, so nothing downstream can render Try it, Adjust or Not now,
 * and these templates must not smuggle an instruction into the statement instead. A guard test asserts that
 * mechanically, the way the money lint asserts numeric safety.
 *
 * Distress arrives as a flag rather than being recomputed: `distress()` needs the intelligence Signal set,
 * which this layer deliberately does not hold, so the caller that already has it passes the answer in.
 */
export type ObserveOptions={distress?:boolean;currency:Currency};

const found=(metrics:Metric[],key:MetricKey)=>{const m=metrics.find(x=>x.key===key);return m&&m.status==='ok'&&m.value!==null?m:null;};
const amount=(minor:string,currency:Currency)=>({minor,currency});

/** 1 — explain what accumulated, at what frequency and price. */
function understand(metrics:Metric[],options:ObserveOptions):Observation[]{
 const category=found(metrics,'category_breakdown');
 if(!category)return [];
 const name=category.details.largest??'that category';
 // This used to read "Uncategorised came to this much, across 23 purchases at transfer to … payid …",
 // gluing two unrelated metrics with a comma: the biggest category, and the merchant label paid most
 // often. Joined that way it states that those purchases belong to that category, which is usually
 // false. The repeat count is a measure of its own and is listed as one, with its own evidence, and
 // named merchants already have their own section in spending patterns.
 return [{id:'understand:'+category.period,metric:'category_breakdown',concept:'understand',
  statement:name==='Uncategorised'
   ? 'Not categorised yet.'
   : `Largest category · ${name}`,
  figure:amount(category.value!,options.currency),visual:'bar',evidence:category.evidence,conditional:null,progress:null}];
}

/**
 * 2 — connect a pattern to a goal the user already recorded.
 *
 * Returns nothing when no goal exists. A goal is never invented, and an obstacle is drawn from the user's
 * own figures rather than assumed.
 */
function goalObstacle(index:AnalysisIndex,metrics:Metric[],options:ObserveOptions):Observation[]{
 const goals=index.snapshot.goals??[];
 const goal=goals.find(g=>BigInt(g.targetMinor)>BigInt(g.fundedMinor));
 const surplus=found(metrics,'surplus');
 if(!goal||!surplus)return [];
 const remaining=(BigInt(goal.targetMinor)-BigInt(goal.fundedMinor)).toString();
 return [{id:'goal_obstacle:'+goal.id+':'+surplus.period,metric:'surplus',concept:'goal_obstacle',
  statement:`${goal.name} still needs this much, and this period left a different amount after essential and debt costs.`,
  figure:amount(remaining,options.currency),visual:'range',evidence:surplus.evidence,conditional:null,progress:null}];
}

/** 3 — alternatives the user's own history already contains, stated as options. */
function alternatives(metrics:Metric[],options:ObserveOptions):Observation[]{
 const small=found(metrics,'small_payments');
 if(!small)return [];
 return [{id:'alternatives:'+small.period,metric:'small_payments',concept:'alternatives',
  statement:`Small payments, together`,
  figure:amount(small.value!,options.currency),visual:'bar',evidence:small.evidence,conditional:null,progress:null}];
}

/** 4 — conditional arithmetic, with its premise carried beside it and never stated as a saving. */
function contribution(metrics:Metric[],options:ObserveOptions):Observation[]{
 const what=found(metrics,'what_ifs');
 if(!what)return [];
 const perWeek=(BigInt(what.value!)/4n).toString();
 return [{id:'contribution:'+what.period,metric:'what_ifs',concept:'contribution',
  statement:'A tenth of this period’s discretionary spending corresponds to this much per week.',
  figure:amount(perWeek,options.currency),visual:'none',evidence:what.evidence,
  conditional:{premise:what.details.premise??'If one tenth of discretionary spending had not occurred.',perWeekMinor:perWeek},progress:null}];
}

/** 5 — what actually happened, kept separate from what was only modelled. */
function progress(metrics:Metric[],options:ObserveOptions):Observation[]{
 const comparison=found(metrics,'period_comparison'),what=found(metrics,'what_ifs');
 if(!comparison)return [];
 return [{id:'progress:'+comparison.period,metric:'period_comparison',concept:'progress',
  statement:`Spending this period differs from ${comparison.details.priorPeriod??'the period before'} by this much.`,
  figure:amount(comparison.value!,options.currency),visual:'sparkline',evidence:comparison.evidence,conditional:null,
  progress:{actualMinor:comparison.value!,scenarioMinor:what?what.value!:'0'}}];
}

/**
 * 6 — dignity: state the limits of the figures plainly.
 *
 * No shame, diagnosis, urgency or punishment, and no claim about motive, intent or enjoyment that a
 * statement cannot evidence. Where coverage is incomplete the figures say so rather than reading as an
 * absence of spending.
 */
function dignity(metrics:Metric[]):Observation[]{
 const any=metrics[0];
 if(!any)return [];
 const gaps=any.coverage.gaps.length;
 const statement=gaps>0
  ? `${gaps} ${gaps===1?'day':'days'} without statement coverage`
  : `Full statement coverage`;
 return [{id:'dignity:'+any.period,metric:any.key,concept:'dignity',statement,figure:{count:gaps},
  visual:'none',evidence:[],conditional:null,progress:null}];
}

/**
 * Observations for one window.
 *
 * Under distress the output reduces to what orients without adding load: what the figures are, and what
 * they do not cover. Conditional arithmetic, goals and alternatives are withheld.
 */
export function observe(index:AnalysisIndex,metrics:Metric[],window:Window,options:ObserveOptions):Observation[]{
 void window;
 if(options.distress)return [...understand(metrics,options),...dignity(metrics)];
 return [
  ...understand(metrics,options),
  ...goalObstacle(index,metrics,options),
  ...alternatives(metrics,options),
  ...contribution(metrics,options),
  ...progress(metrics,options),
  ...dignity(metrics),
 ];
}
