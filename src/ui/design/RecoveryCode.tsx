import {Input} from './primitives';
/** Keep the full selectable value and show every group without horizontal scrolling. */
export function RecoveryCode({value}:{value:string}) {
 return <div className="stack"><Input label="Recovery code" readOnly value={value} onFocus={e=>e.target.select()}/><div className="recovery-groups" aria-hidden="true">{value.split('-').map((group,i)=><span key={i}>{group}</span>)}</div></div>;
}
