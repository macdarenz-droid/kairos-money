import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode} from 'react';
/** Variable-height rows: measured at the current font size, with keyboard page access. */
export function WindowedList<T>({items,id,render,label,onRange}:{items:T[];id:(item:T)=>string;render:(item:T)=>ReactNode;label:string;onRange?:(start:number,end:number)=>void}){
 const viewport=useRef<HTMLDivElement>(null),[top,setTop]=useState(0),[heights,setHeights]=useState(new Map<string,number>());
 const pendingHeights=useRef(new Map<string,number>()),measureFrame=useRef<number|null>(null);
 const measure=useCallback((key:string,height:number)=>{
  pendingHeights.current.set(key,height);
  if(measureFrame.current!==null)return;
  measureFrame.current=requestAnimationFrame(()=>{measureFrame.current=null;const pending=pendingHeights.current;pendingHeights.current=new Map();setHeights(old=>{let next:Map<string,number>|undefined;for(const [itemKey,itemHeight] of pending)if(old.get(itemKey)!==itemHeight){next??=new Map(old);next.set(itemKey,itemHeight);}return next??old;});});
 },[]);
 useEffect(()=>()=>{if(measureFrame.current!==null)cancelAnimationFrame(measureFrame.current);},[]);
 const offsets=useMemo(()=>{const result=[0];for(const item of items)result.push(result.at(-1)!+(heights.get(id(item))??80));return result;},[items,heights,id]);
 let lower=0,upper=items.length;while(lower<upper){const mid=(lower+upper)>>>1;if(offsets[mid+1]!<top)lower=mid+1;else upper=mid;}
 const start=Math.max(0,lower-3);let end=lower;while(end<items.length&&offsets[end]!<top+560)end++;end=Math.min(items.length,end+3);
 // Report the visible window so a caller reading the ledger in pages can load the rows in view.
 const reported=useRef('');
 useEffect(()=>{const key=start+':'+end;if(onRange&&reported.current!==key){reported.current=key;onRange(start,end);}});
 function jump(index:number){const y=offsets[Math.max(0,Math.min(items.length-1,index))]??0;if(viewport.current)viewport.current.scrollTop=y;setTop(y);}
 return <><div className="windowed-list" ref={viewport} role="list" aria-label={label} tabIndex={0} onScroll={e=>setTop(e.currentTarget.scrollTop)}><div style={{height:offsets.at(-1),position:'relative'}}>{items.slice(start,end).map((item,index)=><MeasuredRow key={id(item)} itemKey={id(item)} top={offsets[start+index]!} position={start+index+1} total={items.length} measure={measure}>{render(item)}</MeasuredRow>)}</div></div><div className="form-actions"><button type="button" className="button" disabled={lower===0} onClick={()=>jump(lower-6)}>Earlier rows</button><span className="meta">{items.length} transactions</span><button type="button" className="button" disabled={end>=items.length} onClick={()=>jump(lower+6)}>Later rows</button></div></>;
}
function MeasuredRow({children,itemKey,top,position,total,measure}:{children:ReactNode;itemKey:string;top:number;position:number;total:number;measure:(id:string,height:number)=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const node=ref.current;if(!node)return;const read=()=>{const h=Math.ceil(node.getBoundingClientRect().height);if(h>0)measure(itemKey,h);};read();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(read);observer.observe(node);return()=>observer.disconnect();},[itemKey,measure]);
 return <div ref={ref} role="listitem" aria-posinset={position} aria-setsize={total} style={{position:'absolute',top,width:'100%'}}>{children}</div>;
}
