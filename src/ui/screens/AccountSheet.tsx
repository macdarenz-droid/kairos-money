import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currency, currencyDigits, parseDecimal } from '../../core/money';
import type { Account, AccountKind } from '../../core/db/repository';
import { fromDatabase, format, money } from '../../core/money';
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

/**
 * One sheet for creating an account and for changing one afterwards.
 *
 * An account used to be write-once: typed in at setup and permanently whatever it was. The rows on the
 * Ledger were not even pressable, so a misspelt name stayed misspelt, an opening balance guessed before
 * the first statement arrived could never be corrected, and an account closed at the bank went on
 * appearing in every total. He reported it exactly: "once i set an acct, i cant do anything manually."
 *
 * Editing does not offer the currency. Every transaction already recorded here is stored in this
 * account's minor units, so changing the code would reinterpret its entire history — cents read as sen —
 * without touching a single stored number. Closing the account and opening another is the honest path,
 * and it is one press away below.
 */
export function AccountSheet({ account, onClose, onSaved }: { account?: Account; onClose: () => void; onSaved: () => void }) {
  const session = useSession(); const query = useQueryClient();
  const editing = !!account;
  const [name, setName] = useState(account?.name ?? ''); const [institution, setInstitution] = useState(account?.institution ?? '');
  const [kind, setKind] = useState<AccountKind>((account?.type as AccountKind) ?? 'checking');
  const [code, setCode] = useState(account?.currency ?? 'AUD'); const [mask, setMask] = useState(account?.mask_last4 ?? '');
  const [balance, setBalance] = useState(account
    ? format(money(fromDatabase(account.opening_balance_minor, currency(account.currency)).minor, currency(account.currency)), 'en-AU').replace(/[^0-9.-]/g, '')
    : '0');

  const primary = useQuery({ queryKey: ['primary-account'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.notices.defaultAccount()) });

  const mutation = useMutation({ mutationFn: async () => {
    const value = parseDecimal(balance, currency(code));
    if (account) await session.run(repo => repo.updateAccount(account.id, { name, institution, type: kind, mask_last4: mask || null, opening_balance_minor: value.minor }));
    else await session.run(repo => repo.addAccount({ id: crypto.randomUUID(), name, institution, type: kind, currency: currency(code), mask_last4: mask || null, opening_balance_minor: value.minor }));
  }, onSuccess: async () => { await query.invalidateQueries(); onSaved(); onClose(); } });

  const setPrimary = useMutation({
    mutationFn: () => session.run(repo => repo.notices.setDefaultAccount(account!.id)),
    onSuccess: () => query.invalidateQueries(),
  });
  const archive = useMutation({
    mutationFn: () => session.run(repo => repo.updateAccount(account!.id, { archived: !account!.archived_at })),
    onSuccess: async () => { await query.invalidateQueries(); onSaved(); onClose(); },
  });
  function submit(event: FormEvent) { event.preventDefault(); mutation.mutate(); }
  return <Sheet title={editing ? account.name : 'Add an account'} onClose={onClose}>{session.state === 'preview' ? <div className="stack"><p>Account storage requires the Android app, where your ledger is encrypted. This browser view lets you inspect the design.</p><Button onClick={onClose}>Got it</Button></div> : <form className="stack" onSubmit={submit}>
    <Input label="Account name" placeholder="Everyday account" value={name} onChange={e => setName(e.target.value)} maxLength={80} required/>
    <Input label="Institution (optional)" placeholder="Bank or provider" value={institution} maxLength={80} onChange={e => setInstitution(e.target.value)} hint="Leave it blank if you would rather not say; it is a label, not part of any balance."/>
    <div className="split-field"><label className="input-label">Account type<select value={kind} onChange={e => setKind(e.target.value as AccountKind)}><option value="checking">Transaction</option><option value="savings">Savings</option><option value="credit">Credit card</option><option value="cash">Cash</option><option value="loan">Loan</option><option value="investment">Investment</option></select></label>{editing ? <label className="input-label">Currency<input value={code} readOnly disabled/></label> : <label className="input-label">Currency<select value={code} onChange={e => setCode(e.target.value)}>{Object.keys(currencyDigits).map(c => <option key={c}>{c}</option>)}</select></label>}</div>
    <Input label="Last four digits (optional)" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={mask} onChange={e => setMask(e.target.value)} hint="Never enter the full account number."/>
    <Input label="Opening balance" inputMode="decimal" value={balance} onChange={e => setBalance(e.target.value)} required hint={kind === 'credit' || kind === 'loan' ? 'Enter money owed as a negative amount.' : 'Use 0 until you have a confirmed starting balance.'}/>
    {mutation.error && <p className="error" role="alert">{mutation.error.message}</p>}
    {editing && <div className="stack section-gap">
      {primary.data === account.id
        ? <p className="meta"><span className="tag tag-primary">Primary account</span></p>
        : <Button disabled={setPrimary.isPending || !!account.archived_at} onClick={() => setPrimary.mutate()}>Make this my primary account</Button>}
      {/* Closing an account keeps every transaction already recorded against it — the history stays true,
          the account simply stops being offered for new money. */}
      <Button variant={account.archived_at ? 'default' : 'danger'} disabled={archive.isPending} onClick={() => archive.mutate()}>
        {account.archived_at ? 'Reopen this account' : 'Close this account'}</Button>
      {(setPrimary.error || archive.error) && <p role="alert">{(setPrimary.error ?? archive.error)!.message}</p>}
    </div>}
    <div className="form-actions"><Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button><Button variant="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Saving…' : 'Save account'}</Button></div>
  </form>}</Sheet>;
}
