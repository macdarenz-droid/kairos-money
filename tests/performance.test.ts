import {expect,it} from 'vitest';
import {benchmarkLedger} from '../scripts/benchmark-ledger';
it('loads 20,000 materialized ledger records with complete SQLite source provenance',async()=>{const result=await benchmarkLedger();expect(result.rows).toBe(20000);expect(result.materialized_ledger_workspace_ms).toBeLessThan(5000);console.info(JSON.stringify(result));},120000);
