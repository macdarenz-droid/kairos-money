import {expect,it} from 'vitest';
import {benchmarkLedger} from '../scripts/benchmark-ledger';
it('benchmarks 20,000 synthetic records with complete SQLite source provenance',async()=>{const result=await benchmarkLedger();expect(result.rows).toBe(20000);console.info(JSON.stringify(result));},120000);
