import type {Transaction,Kind} from './model';
export type Allocation={category:string;kind:'essential'|'discretionary';minor:string};
export function categoryAmounts(t:Transaction):(Omit<Allocation,'kind'>&{kind:Kind})[]{return t.allocations??[{category:t.category,kind:t.kind,minor:(BigInt(t.minor)<0n?-BigInt(t.minor):BigInt(t.minor)).toString()}];}
export function kindAmount(t:Transaction,kind:Kind):bigint{return categoryAmounts(t).filter(p=>p.kind===kind).reduce((n,p)=>n+BigInt(p.minor),0n);}
