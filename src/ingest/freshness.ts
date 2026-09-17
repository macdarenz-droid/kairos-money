export function importResultSentence(results: readonly {added:number;known:number;superseded:number}[]) {
 const value=results.reduce((s,r)=>({added:s.added+r.added,known:s.known+r.known,superseded:s.superseded+r.superseded}),{added:0,known:0,superseded:0});
 return `Added ${value.added} new ${value.added===1?'transaction':'transactions'}. ${value.known} ${value.known===1?'was':'were'} already known and kept once. Updated ${value.superseded} pending ${value.superseded===1?'transaction':'transactions'} to settled values.`;
}
