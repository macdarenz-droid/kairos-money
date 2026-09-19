import {describe, expect, it} from 'vitest';
import {BLOCKS, BLOCK_DAYS, changePercent, moneyBand} from '../src/intelligence/visuals/band';
import {currency} from '../src/core/money';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const AUD = currency('AUD'), TODAY = '2026-09-16';

function row(over: Partial<Transaction> & {id: string; date: string; minor: string}): Transaction {
  return {accountId: 'a', currency: AUD, description: 'Cafe Mika', category: 'Eating out',
    kind: 'discretionary', status: 'settled', transfer: false, recurring: false, ...over};
}
function snap(transactions: Transaction[], over: Partial<Snapshot> = {}): Snapshot {
  // No coverage at all: the band must work for someone who has never imported a statement.
  return {asOf: TODAY, currency: AUD, accountIds: ['a', 'b'], coverage: [], pays: [], transactions, ...over};
}

describe('the four figures the home screen leads with', () => {
  it('cuts six equal blocks that meet end to end at the last day it knows about', () => {
    const band = moneyBand(snap([row({id: 'x', date: '2026-09-16', minor: '-1000'})]), TODAY);
    expect(band.blocks).toHaveLength(BLOCKS);
    expect(band.now.end).toBe('2026-09-16');
    expect(band.now.start).toBe('2026-08-18');
    expect(band.before.end).toBe('2026-08-17');
    expect(band.start).toBe('2026-03-21');
    // Contiguous and equal: no day belongs to two blocks and none falls between them.
    for (let i = 1; i < band.blocks.length; i++) {
      const previous = Date.parse(band.blocks[i - 1]!.end), start = Date.parse(band.blocks[i]!.start);
      expect((start - previous) / 86400000).toBe(1);
      const span = (Date.parse(band.blocks[i]!.end) - start) / 86400000 + 1;
      expect(span).toBe(BLOCK_DAYS);
    }
  });

  it('anchors to the newest recorded day, so old statements still draw a band', () => {
    // Statements that stop in June must not produce six empty blocks in September.
    expect(moneyBand(snap([row({id: 'x', date: '2026-06-10', minor: '-1000'})]), TODAY).now.end).toBe('2026-06-10');
    // A future-dated row must not drag the window into days nothing can have happened in.
    expect(moneyBand(snap([row({id: 'x', date: '2026-12-01', minor: '-1000'})]), TODAY).now.end).toBe(TODAY);
    expect(moneyBand(snap([]), TODAY).now.end).toBe(TODAY);
  });

  it('adds up what arrived and what left, each as its own positive total', () => {
    const band = moneyBand(snap([
      row({id: 'pay', date: '2026-09-01', minor: '500000', kind: 'income'}),
      row({id: 'a', date: '2026-09-02', minor: '-12500'}),
      row({id: 'b', date: '2026-09-03', minor: '-7500'}),
    ]), TODAY);
    expect(band.now.inMinor).toBe('500000');
    expect(band.now.outMinor).toBe('20000');
    expect(band.now.netMinor).toBe('480000');
  });

  it('counts money that no statement has confirmed yet, and says so', () => {
    // The regression this exists to stop: an approved notification is written pending, because a bank's
    // push is an authorisation rather than a settled row. Excluding pending here would show a zero band to
    // someone whose ledger is entirely approved notifications — the same failure as rendering an opening
    // balance and calling it a balance.
    const band = moneyBand(snap([row({id: 'n', date: '2026-09-15', minor: '-3000', status: 'pending'})]), TODAY);
    expect(band.now.outMinor).toBe('3000');
    expect(band.now.unconfirmed).toBe(true);
    expect(moneyBand(snap([row({id: 's', date: '2026-09-15', minor: '-3000'})]), TODAY).now.unconfirmed).toBe(false);
  });

  it('never needs an imported statement to count a day', () => {
    // covered() gates the thirty-six measures and must not gate this: someone recording by hand has no
    // coverage rows at all, and a band that waits for a statement never moves.
    const band = moneyBand(snap([row({id: 'm', date: '2026-09-14', minor: '-5000'})], {coverage: []}), TODAY);
    expect(band.now.outMinor).toBe('5000');
  });

  it('leaves out money moved between the owner\'s own accounts', () => {
    const band = moneyBand(snap([
      row({id: 'out', date: '2026-09-10', minor: '-10000', transfer: true}),
      row({id: 'in', date: '2026-09-10', minor: '10000', accountId: 'b', transfer: true}),
      row({id: 'kind', date: '2026-09-11', minor: '-2500', kind: 'transfer'}),
    ]), TODAY);
    expect(band.now.inMinor).toBe('0');
    expect(band.now.outMinor).toBe('0');
  });

  it('ignores another currency and another account', () => {
    const band = moneyBand(snap([
      row({id: 'usd', date: '2026-09-10', minor: '-9900', currency: currency('USD')}),
      row({id: 'gone', date: '2026-09-10', minor: '-8800', accountId: 'archived'}),
      row({id: 'mine', date: '2026-09-10', minor: '-1100'}),
    ]), TODAY);
    expect(band.now.outMinor).toBe('1100');
  });

  it('refuses to compare against a block where nothing moved', () => {
    const alone = moneyBand(snap([row({id: 'x', date: '2026-09-10', minor: '-1000'})]), TODAY);
    expect(alone.comparable).toBe(false);
    // 2026-08-01 falls in the previous block; 2026-09-10 in the current one.
    const both = moneyBand(snap([
      row({id: 'old', date: '2026-08-01', minor: '-1000'}),
      row({id: 'new', date: '2026-09-10', minor: '-1000'}),
    ]), TODAY);
    expect(both.comparable).toBe(true);
  });

  it('draws a shape only once there is enough history to be a shape', () => {
    expect(moneyBand(snap([row({id: 'x', date: '2026-09-10', minor: '-1000'})]), TODAY).trend).toBe(false);
    const spread = moneyBand(snap([
      row({id: 'a', date: '2026-09-10', minor: '-1000'}),
      row({id: 'b', date: '2026-08-01', minor: '-1000'}),
      row({id: 'c', date: '2026-07-01', minor: '-1000'}),
    ]), TODAY);
    expect(spread.trend).toBe(true);
  });
});

describe('the change beside a figure', () => {
  it('is a whole per cent, in either direction', () => {
    expect(changePercent('15000', '10000')).toBe('50');
    expect(changePercent('5000', '10000')).toBe('-50');
    expect(changePercent('10000', '10000')).toBe('0');
  });

  it('says nothing rather than inventing a rise out of nothing', () => {
    expect(changePercent('10000', '0')).toBeNull();
    expect(changePercent('0', '0')).toBeNull();
  });

  it('stays exact on amounts a float would round', () => {
    expect(changePercent('900719925474099100', '450359962737049550')).toBe('100');
  });
});
