import {Button,Surface} from '../design/primitives';

/**
 * The first thing a new user meets, and the moment they are most likely to give up.
 *
 * This used to be a four-step procedure about statements, which answered "how does importing work" when
 * the question in the user's head was "what do I do now". It also pushed everyone down the heavier of the
 * two paths: importing a statement is how you get history, but recording a purchase is how you start, and
 * it needs nothing set up at all.
 *
 * So it offers the two real starting points, lightest first, in the words someone would use themselves.
 * The procedure is still here for anyone who wants it, one tap away.
 */
export function FirstImport({hasAccount,loading,onAccount,onRead,onRecord}:{hasAccount:boolean;loading:boolean;onAccount:()=>void;onRead:()=>void;onRecord:()=>void}){
 return <Surface>
  <h2>Two ways to start</h2>
  <p>Kairos keeps everything on this device. It never connects to your bank.</p>

  <h3>Record what you spend, as you spend it</h3>
  <p>Best if you just want to keep track from today. Nothing to set up — add a purchase and you have started.</p>
  <Button variant="primary" onClick={onRecord}>Record a purchase</Button>

  <h3>Bring in your history from a statement</h3>
  <p>Best if you want to see the last few months straight away. You give Kairos a statement file your bank
   already gives you, and it reads the transactions out of it.</p>
  <Button disabled={loading} onClick={hasAccount?onRead:onAccount}>
   {loading?'Reading accounts…':hasAccount?'Choose a statement file':'Set up the account first'}</Button>

  <details>
   <summary>What happens when you import a statement</summary>
   <ol>
    <li>You tell Kairos which account the statement belongs to. That is just a label here; it is not a
     connection to your bank.</li>
    <li>You pick the file. Kairos reads the dates, amounts and descriptions out of it.</li>
    <li>You look over what it found. Nothing is added to your records until you say so.</li>
    <li>You confirm, and it becomes part of your history.</li>
   </ol>
  </details>
 </Surface>;
}
