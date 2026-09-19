/**
 * Exact allocation of a money total across parts.
 *
 * These are not proposals: nothing here is derived from what the user entered before, so there is no
 * evidence to cite and nothing to explain. They are the arithmetic behind two buttons that save typing,
 * kept here as pure functions because they are the part that has to be exactly right. Embedded in a click
 * handler they could only be exercised through a rendered screen, which is how an off-by-one-cent
 * allocation survives a test suite.
 *
 * Every function works in minor units as bigint. No part of this file converts money to a number.
 */

/**
 * Divide `total` into `count` parts that sum to exactly `total`.
 *
 * bigint division truncates toward zero, so the parts are the truncated share and the indivisible
 * remainder is handed out one minor unit at a time to the parts at the front. The remainder carries the
 * sign of the total, so a negative total distributes correctly rather than summing short.
 */
export function splitEvenly(total:bigint,count:number):bigint[]{
 if(!Number.isInteger(count)||count<1)throw new Error('Split across at least one part.');
 const parts=BigInt(count),base=total/parts,spare=total-base*parts,step=spare<0n?-1n:1n,extra=spare<0n?-spare:spare;
 return Array.from({length:count},(_,i)=>base+(BigInt(i)<extra?step:0n));
}

/**
 * Which part should absorb what is still unallocated.
 *
 * The first part the user has not filled in, because that is the one they were about to type into.
 * When every part has an amount the last one absorbs it, so the button still resolves a rounding gap
 * instead of doing nothing.
 *
 * `entered` is the text in each part's field, not money: these are the raw strings the user typed, and the
 * only arithmetic done on them is finding an index. Naming it `amounts` made the money lint reject
 * `entered.length-1`, and the lint was right to — a name that says money invites arithmetic that must not
 * happen on money. The amounts themselves stay bigint everywhere they are actually added up.
 */
export function fillTarget(entered:readonly string[]):number{
 if(!entered.length)throw new Error('Fill into at least one part.');
 const empty=entered.findIndex(text=>text.trim()==='');
 return empty===-1?entered.length-1:empty;
}
