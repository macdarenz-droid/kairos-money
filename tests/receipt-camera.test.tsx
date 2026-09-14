// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {ReceiptCamera} from '../src/ui/screens/ReceiptCamera';
const stop=vi.fn(),getUserMedia=vi.fn();
const media={getTracks:()=>[{stop}]} as unknown as MediaStream;
beforeEach(()=>{
 stop.mockReset();getUserMedia.mockReset().mockResolvedValue(media);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue();
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as unknown as CanvasRenderingContext2D);
 vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,U3ludGhldGlj');
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
async function take(){const video=screen.getByLabelText('Live receipt camera preview');await waitFor(()=>expect((video as HTMLVideoElement).srcObject).toBe(media));Object.defineProperties(video,{videoWidth:{value:1920},videoHeight:{value:2560}});fireEvent.loadedData(video);fireEvent.click(screen.getByRole('button',{name:'Take photo'}));}
it('requires photo review, stops the camera and passes only confirmed bytes to storage',async()=>{
 const use=vi.fn().mockResolvedValue(undefined),close=vi.fn();render(<ReceiptCamera onUse={use} onClose={close}/>);
 expect(screen.getByRole('button',{name:'Take photo'}).hasAttribute('disabled')).toBe(true);
 await take();expect(use).not.toHaveBeenCalled();expect(stop).toHaveBeenCalledTimes(1);expect(screen.getByAltText('Receipt photo to review before attaching')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Use photo'}));await waitFor(()=>expect(close).toHaveBeenCalledTimes(1));expect(use).toHaveBeenCalledWith('U3ludGhldGlj',expect.any(AbortSignal));expect(getUserMedia.mock.calls[0]?.[0].audio).toBe(false);
});
it('stops a permission request that completes after cancellation without saving',async()=>{
 let resolve!:(value:MediaStream)=>void;getUserMedia.mockReturnValue(new Promise<MediaStream>(done=>{resolve=done;}));const use=vi.fn();const view=render(<ReceiptCamera onUse={use} onClose={vi.fn()}/>);view.unmount();await act(async()=>resolve(media));expect(stop).toHaveBeenCalledTimes(1);expect(use).not.toHaveBeenCalled();
});
it('aborts a pending save when the receipt screen is removed by lock',async()=>{
 let signal:AbortSignal|undefined;let resolve!:()=>void;const close=vi.fn();const view=render(<ReceiptCamera onUse={async(_data,s)=>{signal=s;await new Promise<void>(done=>{resolve=done;});}} onClose={close}/>);await take();fireEvent.click(screen.getByRole('button',{name:'Use photo'}));await waitFor(()=>expect(signal).toBeDefined());view.unmount();expect(signal?.aborted).toBe(true);await act(async()=>resolve());expect(close).not.toHaveBeenCalled();
});
it('discloses denied access and supports retry',async()=>{
 getUserMedia.mockRejectedValueOnce(new DOMException('Denied','NotAllowedError'));render(<ReceiptCamera onUse={vi.fn()} onClose={vi.fn()}/>);expect((await screen.findByRole('alert')).textContent).toContain('Camera access was denied');fireEvent.click(screen.getByRole('button',{name:'Retry camera'}));await waitFor(()=>expect(getUserMedia).toHaveBeenCalledTimes(2));
});
it('retakes without saving the discarded frame',async()=>{
 const use=vi.fn();render(<ReceiptCamera onUse={use} onClose={vi.fn()}/>);await take();fireEvent.click(screen.getByRole('button',{name:'Retake photo'}));await waitFor(()=>expect(getUserMedia).toHaveBeenCalledTimes(2));expect(use).not.toHaveBeenCalled();
});
