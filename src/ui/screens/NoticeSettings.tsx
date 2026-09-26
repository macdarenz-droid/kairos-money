import {useEffect, useRef, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Notices, noticeAccess, noticesAvailable, installedSources, watchSources} from '../../ingest/notices';
import {Button, Explain, Input, Row} from '../design/primitives';
import {useSession} from '../session';
import type {Account} from '../../core/db/repository';

/**
 * Turning on reading bank notifications, and choosing whose.
 *
 * Says what the access actually costs before offering it. Android has no permission for "only my bank's
 * notifications" — a listener is offered every notification on the phone — and a person cannot weigh that
 * against what they get unless they are told, in the sentence before the button, rather than in a policy.
 *
 * Two steps, and both are the owner's: Android grants the access in its own settings screen, and the apps
 * to read are chosen here. Until an app is chosen nothing is captured from it, whatever the grant says.
 */
export function NoticeSettings({accounts = []}: {accounts?: readonly Account[]} = {}) {
  const client = useQueryClient();
  const session = useSession();
  const [error, setError] = useState(''), [search, setSearch] = useState(''), [all, setAll] = useState(false);
  const access = useQuery({queryKey: ['notice-access'], queryFn: noticeAccess, enabled: noticesAvailable()});
  // The grant is made in Android settings, away from Kairos; read it again whenever Kairos comes back.
  const shown = useRef(session.state);
  useEffect(() => {
    if (session.state === 'ready' && shown.current !== 'ready') void client.invalidateQueries({queryKey: ['notice-access']});
    shown.current = session.state;
  }, [session.state, client]);
  const fallback = useQuery({
    queryKey: ['notice-default-account'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.notices.defaultAccount()),
  });
  const live = accounts.filter(a => !a.archived_at);
  const apps = useQuery({queryKey: ['notice-apps'], queryFn: installedSources, enabled: noticesAvailable() && !!access.data?.granted});

  if (!noticesAvailable()) return null;
  const granted = access.data?.granted ?? false;
  const watched = access.data?.sources ?? [];

  // Names and package ids of the apps that announce money. Matching is a hint for ordering the list, never
  // a restriction: "Show all apps" is one press away, and anything already ticked is always listed.
  //
  // The named brands were all Australian, which made this list useless to anybody else — a Philippine
  // owner would see none of GCash, BPI, BDO or GoTyme near the top and would have to go hunting through
  // every app on the phone. The generic words carry most of the work (anything with "bank", "pay" or
  // "wallet" in its name or package id already surfaces, which covers Maribank, Landbank, UnionBank,
  // Metrobank, SeaBank, Maya and InstaPay); only the brands those words miss are worth naming.
  const MONEY = /bank|banking|money|pay|wallet|card|credit|super|finance|financial|invest|crypto|afterpay|zip|klarna|humm|paypal|wise|revolut|westpac|commbank|nab\b|anz\b|ubank|bendigo|macquarie|amex|visa|mastercard|beem|osko|gcash|bpi\b|bdo\b|gotyme|rcbc|coins\.ph|grab/i;
  const every = apps.data ?? [];
  const likely = every.filter(app => MONEY.test(app.label) || MONEY.test(app.id) || watched.includes(app.id));
  const hidden = every.length - likely.length;
  const pool = all ? every : likely;
  const needle = search.trim().toLowerCase();
  const listed = needle
    ? every.filter(app => app.label.toLowerCase().includes(needle) || app.id.toLowerCase().includes(needle))
    : pool;

  async function choose(id: string) {
    setError('');
    const next = watched.includes(id) ? watched.filter(other => other !== id) : [...watched, id];
    try {
      await watchSources(next);
      await Promise.all([client.invalidateQueries({queryKey: ['notice-access']}), client.invalidateQueries({queryKey: ['captured-notices']})]);
    }
    catch { setError('That choice could not be saved. Try again.'); }
  }

  return <section className="settings-section">
    <span className="heading-row"><h2>Read my bank's notifications</h2>
      <Explain title="Read my bank's notifications">
        <p>Kairos turns purchase alerts from your banking app into entries you approve. Android grants every
          app's notifications at once, so Kairos reads only the apps you tick and keeps it all on this device.</p>
      </Explain>
    </span>
    {/* This sentence stays in front of the button that grants the access. It is what the person is being
        asked to weigh, and moving it behind a mark they have to go looking for would be asking for consent
        while hiding the cost. Everything else about the feature is one press away above. */}
    <p>Granting this lets Kairos see every notification on this phone, including your messages. It reads
      only the apps you tick below.</p>

    <Row trailing={<Button onClick={() => { void Notices.openSettings(); }}>{granted ? 'Change in Android' : 'Grant in Android'}</Button>}>
      Notification access
      <p>{granted ? 'Granted. Only the apps ticked below are read.' : 'Not granted. Nothing is being read.'}</p>
    </Row>

    {granted && <>
      <h3>Which apps to read</h3>
      {apps.isPending && <p className="meta">Reading the apps on this phone.</p>}
      {apps.data?.length === 0 && <p className="meta">No apps to choose from on this phone.</p>}
      {!!apps.data?.length && <Input label="Find an app" placeholder="Name of your bank" value={search}
        onChange={e => setSearch(e.target.value)}/>}
      {listed.map(app => <label key={app.id} className="check-row">
        <input type="checkbox" checked={watched.includes(app.id)} onChange={() => void choose(app.id)}/>
        <span>{app.label}<span className="meta"> · {app.id}</span></span>
      </label>)}
      {!listed.length && <p className="meta">No app here matches that. Try part of your bank's name.</p>}
      {/* Chromed, not quiet. Offering the likely apps first is only safe because this is here: a bank whose
          name does not match the hint has to be reachable, and a borderless control at the end of a list
          reads as a caption. If this is missed, the shortlist stops being a shortcut and becomes a wall. */}
      {!search && hidden > 0 && <Button onClick={() => setAll(shown => !shown)}>
        {all ? 'Show money apps only' : `Show all ${(apps.data ?? []).length} apps`}
      </Button>}
      {!watched.length && <p className="meta">Nothing is ticked, so nothing is being read yet.</p>}

      {live.length > 1 && <>
        <span className="heading-row"><h3>Which account these belong to</h3>
          <Explain title="Which account these belong to">
            <p>When a notification says which account it is about — "ending 407" — Kairos uses that.</p>
            <p>This is what it falls back on when the message does not say, and you can still change it on
              any purchase before approving it.</p>
          </Explain>
        </span>
        <label className="input-label">Usual account
          <select value={fallback.data ?? ''}
            onChange={e => { void session.run(repo => repo.notices.setDefaultAccount(e.target.value || null))
              .then(() => client.invalidateQueries({queryKey: ['notice-default-account']}))
              .catch(() => setError('That account could not be saved. Try again.')); }}>
            <option value="">No preference — use the first account</option>
            {live.map(a => <option key={a.id} value={a.id}>{a.name}{a.mask_last4 ? ` · ••${a.mask_last4}` : ''}</option>)}
          </select>
        </label>
        {live.some(a => !a.mask_last4) && <p className="meta">Adding the last four digits to each account
          lets Kairos read which one a notification means, instead of falling back to this.</p>}
      </>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
