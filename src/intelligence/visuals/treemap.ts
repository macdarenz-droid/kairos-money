import {displayRatio} from './index';
export type Tile={name:string;minor:string;x:number;y:number;width:number;height:number};
/** Layout only: exact minor units determine areas; floating point is confined to SVG geometry. */
export function categoryTiles(input:{name:string;minor:string}[]):Tile[]{
 const entries=input.filter(r=>BigInt(r.minor)>0n).sort((a,b)=>BigInt(a.minor)>BigInt(b.minor)?-1:BigInt(a.minor)<BigInt(b.minor)?1:a.name.localeCompare(b.name));
 function split(rows:typeof entries,x:number,y:number,width:number,height:number):Tile[]{
  if(!rows.length)return [];if(rows.length===1)return [{...rows[0]!,x,y,width,height}];
  const total=rows.reduce((n,r)=>n+BigInt(r.minor),0n);let sum=0n,index=0;
  while(index<rows.length-1&&sum*2n<total){sum+=BigInt(rows[index]!.minor);index++;}
  const ratio=Number(displayRatio(sum.toString(),total.toString()))/1000000;
  if(width>=height){const cut=width*ratio;return [...split(rows.slice(0,index),x,y,cut,height),...split(rows.slice(index),x+cut,y,width-cut,height)];}
  const cut=height*ratio;return [...split(rows.slice(0,index),x,y,width,cut),...split(rows.slice(index),x,y+cut,width,height-cut)];
 }
 return split(entries,0,0,1000,600);
}
