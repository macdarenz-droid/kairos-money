import {useEffect,useRef,useState} from 'react';
import {Button} from '../design/primitives';

/** Camera frames stay in memory until the user confirms the receipt. */
export function ReceiptCamera({onUse,onClose}:{onUse:(data:string,signal:AbortSignal)=>Promise<void>;onClose:()=>void}){
 const video=useRef<HTMLVideoElement>(null),lifetime=useRef(new AbortController());
 const [ready,setReady]=useState(false),[photo,setPhoto]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const controller=new AbortController();lifetime.current=controller;return()=>controller.abort();},[]);
 useEffect(()=>{
  if(photo)return;
  let disposed=false,stream:MediaStream|undefined;const preview=video.current;setReady(false);setError('');
  const stop=()=>{stream?.getTracks().forEach(track=>track.stop());if(preview&&preview.srcObject===stream)preview.srcObject=null;stream=undefined;};
  async function start(){try{
   if(!navigator.mediaDevices?.getUserMedia)throw new Error('The camera is unavailable. Attach an existing receipt photo instead.');
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:2560},height:{ideal:1920}}});
   if(disposed){media.getTracks().forEach(track=>track.stop());return;}
   stream=media;
   if(!video.current)throw new Error('The camera preview could not open. Try again.');
   video.current.srcObject=media;await video.current.play();
  }catch(e){stop();if(!disposed)setError((e instanceof Error||e instanceof DOMException)&&e.name==='NotAllowedError'?'Camera access was denied. Allow camera access in Android settings, or attach an existing photo.':e instanceof Error?e.message:'The camera could not open. Try again.');}}
  void start();return()=>{disposed=true;stop();};
 },[photo,attempt]);
 function take(){const frame=video.current;if(!frame?.videoWidth||!frame.videoHeight){setError('Wait for the receipt preview before taking the photo.');return;}
  const canvas=document.createElement('canvas');const scale=Math.min(1,2560/Math.max(frame.videoWidth,frame.videoHeight));canvas.width=Math.round(frame.videoWidth*scale);canvas.height=Math.round(frame.videoHeight*scale);
  try{const context=canvas.getContext('2d');if(!context)throw new Error('The photo could not be captured. Try attaching an existing photo.');context.drawImage(frame,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',0.92);if(!data.startsWith('data:image/jpeg;base64,')||data.length>13981040)throw new Error('The photo could not be saved within the receipt size limit. Try again.');setPhoto(data);setError('');}catch(e){setError(e instanceof Error?e.message:'The photo could not be captured.');}finally{canvas.width=0;canvas.height=0;}
 }
 async function usePhoto(){setBusy(true);setError('');try{await onUse(photo.slice(photo.indexOf(',')+1),lifetime.current.signal);if(!lifetime.current.signal.aborted)onClose();}catch(e){if(!lifetime.current.signal.aborted)setError(e instanceof Error?e.message:'The receipt could not be saved. Try again.');}finally{if(!lifetime.current.signal.aborted)setBusy(false);}}
 return <section className="stack" aria-label="Receipt camera"><p>Keep the whole receipt in view, then check that its text is clear.</p>{photo?<img src={photo} alt="Receipt photo to review before attaching" style={{width:'100%',maxHeight:'50vh',objectFit:'contain'}}/>:<video ref={video} muted playsInline aria-label="Live receipt camera preview" onLoadedData={()=>setReady(true)} style={{width:'100%',maxHeight:'50vh',objectFit:'contain'}}/>}{photo?<><Button onClick={()=>void usePhoto()} busy={busy} busyLabel="Reading and saving receipt…">Use photo</Button><Button disabled={busy} onClick={()=>setPhoto('')}>Retake photo</Button></>:<><Button disabled={!ready} onClick={take}>Take photo</Button>{error&&<Button onClick={()=>setAttempt(n=>n+1)}>Retry camera</Button>}</>}<Button disabled={busy} onClick={onClose}>Cancel camera</Button>{error&&<p role="alert">{error}</p>}</section>;
}
