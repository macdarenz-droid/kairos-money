import type {Allocation} from '../../intelligence/allocations';
import {money,type Currency} from '../../core/money';
import {Amount,Row} from '../design/primitives';
export function AllocationBreakdown({parts,code}:{parts:Allocation[]|undefined;code:Currency}){return parts?<div><p className="meta">Category portions of the original payment above:</p>{parts.map((p,i)=><Row key={i} trailing={<Amount value={money(BigInt(p.minor),code)} context={`allocated to ${p.category}`}/>}>{p.category}</Row>)}</div>:null;}
