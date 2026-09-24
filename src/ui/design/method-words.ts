import type {MethodReading} from '../../brain/types';

/** How the keep figure works, in plain words; no labels for the person. */
const WORDS: Record<MethodReading['method'], string> = {
  'pay-yourself-first': 'Move it on payday',
  'daily-allowance': 'A set amount each day',
  'round-up': 'Round up small buys',
  'baseline-percent': 'Keep a tenth when paid',
};
export const methodWords = (m: MethodReading) => m.status === 'ok' ? WORDS[m.method] : '';
