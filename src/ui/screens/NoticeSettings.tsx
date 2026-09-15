import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {Notices, noticeAccess, noticesAvailable, installedSources, watchSources} from '../../ingest/notices';
import {Button, Row} from '../design/primitives';

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
export function NoticeSettings() {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const access = useQuery({queryKey: ['notice-access'], queryFn: noticeAccess, enabled: noticesAvailable()});
  const apps = useQuery({queryKey: ['notice-apps'], queryFn: installedSources, enabled: noticesAvailable() && !!access.data?.granted});

  if (!noticesAvailable()) return null;
  const granted = access.data?.granted ?? false;
  const watched = access.data?.sources ?? [];

  async function choose(id: string) {
    setError('');
    const next = watched.includes(id) ? watched.filter(other => other !== id) : [...watched, id];
    try { await watchSources(next); await client.invalidateQueries({queryKey: ['notice-access']}); }
    catch { setError('That choice could not be saved. Try again.'); }
  }

  return <section className="settings-section">
    <h2>Read my bank's notifications</h2>
    <p>Kairos can read the purchase alerts your banking app puts on your screen and ask whether to record
      each one, so your spending is current between statements.</p>
    <p>Android has no way to share only one app's notifications. Granting this lets Kairos see every
      notification on this phone, including your messages. It reads only the apps you tick below and keeps
      everything on this device, and you can withdraw it in Android's settings whenever you like.</p>

    <Row trailing={<Button onClick={() => { void Notices.openSettings(); }}>{granted ? 'Change in Android' : 'Grant in Android'}</Button>}>
      Notification access
      <p>{granted ? 'Granted. Only the apps ticked below are read.' : 'Not granted. Nothing is being read.'}</p>
    </Row>

    {granted && <>
      <h3>Which apps to read</h3>
      {apps.isPending && <p className="meta">Reading the apps on this phone.</p>}
      {apps.data?.length === 0 && <p className="meta">No apps to choose from on this phone.</p>}
      {(apps.data ?? []).map(app => <label key={app.id} className="check-row">
        <input type="checkbox" checked={watched.includes(app.id)} onChange={() => void choose(app.id)}/>
        <span>{app.label}<span className="meta"> · {app.id}</span></span>
      </label>)}
      {!watched.length && <p className="meta">Nothing is ticked, so nothing is being read yet.</p>}
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
