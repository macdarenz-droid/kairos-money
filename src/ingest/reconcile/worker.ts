import {reconcile} from './index';
import type {Document} from '../types';
self.onmessage=(event:MessageEvent<{documents:Document[];keep:string[]}>)=>{
 try{self.postMessage({rows:reconcile(event.data.documents,new Set(event.data.keep))});}catch(error){self.postMessage({error:error instanceof Error?error.message:'Statement reconciliation did not finish.'});}
};
