import {reconcile} from './index';
import type {Document} from '../types';
self.onmessage=(event:MessageEvent<Document[]>)=>{
 try{self.postMessage({rows:reconcile(event.data)});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Statement reconciliation did not finish.'});}
};
