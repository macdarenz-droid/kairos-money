import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { currency, currencyDigits, parseDecimal } from '../../core/money';
import type { AccountKind } from '../../core/db/repository';
import { Button, Input, Sheet } from '../design/primitives';
import { useSession } from '../session';
/*
 * The currency deliberately does NOT default to the device's region.
 *
 * LAZY_USER_SCAN proposed it and it was implemented, and it was wrong. An account's currency is a
 * financial fact, not a preference: it decides how every amount in that account is read and whether an
 * imported statement reconciles at all. A region-derived guess is plausible enough to be accepted without
 * looking — and the device region often is not the account's currency, for anyone who travels, has moved,
 * or holds an account abroad, all of which Kairos supports multi-currency accounts for.
 *
 * A fixed default is visibly wrong to everyone it is wrong for, which prompts a deliberate choice; a
 * region guess is invisibly wrong to exactly the people it fails. Saving one tap is not worth
 * mis-denominating an account, so this keeps the tap.
 */

export function AccountSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const session = useSession(); const query = useQueryClient();
  const [name, setName] = useState(''); const [institution, setInstitution] = useState(''); const [kind, setKind] = useState<AccountKind>('checking');
  const [code, setCode] = useState('AUD'); const [mask, setMask] = useState(''); const [balance, setBalance] = useState('0');
  const mutation = useMutation({ mutationFn: async () => {
    const value = parseDecimal(balance, currency(code));
    await session.run(repo => repo.addAccount({ id: crypto.randomUUID(), name, institution, type: kind, currency: currency(code), mask_last4: mask || null, opening_balance_minor: value.minor }));
  }, onSuccess: async () => { await query.invalidateQueries({ queryKey: ['accounts'] }); onSaved(); onClose(); } });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return <Sheet title="Add an account" onClose={onClose}>{session.state === 'preview' ? <div className="stack"><p>Account storage requires the Android app, where your ledger is encrypted. This browser view lets you inspect the design.</p><Button onClick={onClose}>Got it</Button></div> : <form className="stack" onSubmit={submit}>
    <Input label="Account name" placeholder="Everyday account" value={name} onChange={e => setName(e.target.value)} maxLength={80} required/>
    <Input label="Institution (optional)" placeholder="Bank or provider" value={institution} maxLength={80} onChange={e => setInstitution(e.target.value)} hint="Leave it blank if you would rather not say; it is a label, not part of any balance."/>
    <div className="split-field"><label className="input-label">Account type<select value={kind} onChange={e => setKind(e.target.value as AccountKind)}><option value="checking">Transaction</option><option value="savings">Savings</option><option value="credit">Credit card</option><option value="cash">Cash</option><option value="loan">Loan</option><option value="investment">Investment</option></select></label><label className="input-label">Currency<select value={code} onChange={e => setCode(e.target.value)}>{Object.keys(currencyDigits).map(c => <option key={c}>{c}</option>)}</select></label></div>
    <Input label="Last four digits (optional)" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={mask} onChange={e => setMask(e.target.value)} hint="Never enter the full account number."/>
    <Input label="Opening balance" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} required hint={kind === 'credit' || kind === 'loan' ? 'Enter money owed as a negative amount.' : 'Use 0 until you have a confirmed starting balance.'}/>
    {mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}
    <div className="form-actions"><Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button variant="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save account'}</Button></div>
  </form>}</Sheet>;
}
