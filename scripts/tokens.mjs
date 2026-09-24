import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const dark = {'surface-0':'#08090A','surface-1':'#0E1011','surface-2':'#16191B','surface-3':'#1F2325','text-primary':'#EDEEF0','text-secondary':'#9BA1A6','text-tertiary':'#63696E','accent':'#5B7CFA','positive':'#3FB950','negative':'#E5534B','warning':'#D29922','text-meta':'#969DA3','accent-text':'#9BABFF','accent-solid':'#435BC8','on-accent':'#FFFFFF','positive-text':'#67CB79','negative-text':'#FF9691','warning-text':'#E7B957','border-control':'#707980','heat-1':'#242E55','heat-2':'#293869','heat-3':'#3B51A2','heat-4':'#4E6BD4','heat-5':'#8098FF','heat-ink-1':'#FFFFFF','heat-ink-2':'#FFFFFF','heat-ink-3':'#FFFFFF','heat-ink-4':'#FFFFFF','heat-ink-5':'#08090A','flow-in':'#C4813C','flow-out':'#5B7CFA','flow-in-fill':'#916B3C','flow-out-fill':'#4A5FA8','tile-1':'#252D46','tile-2':'#2E3859','tile-3':'#3A4877','tile-4':'#485895','tile-5':'#5A6DAE','tile-ink':'#FFFFFF'};
const light = {'surface-0':'#FCFCFD','surface-1':'#FFFFFF','surface-2':'#F4F5F6','surface-3':'#EAECEE','text-primary':'#14171A','text-secondary':'#5C6469','text-tertiary':'#8B9296','accent':'#3B5BDB','positive':'#25763A','negative':'#B52D2C','warning':'#805900','text-meta':'#60686E','accent-text':'#324DBB','accent-solid':'#3B5BDB','on-accent':'#FFFFFF','positive-text':'#216C35','negative-text':'#B52D2C','warning-text':'#785300','border-control':'#7C848B','heat-1':'#D3DCF7','heat-2':'#BFCCF4','heat-3':'#8EA4EA','heat-4':'#4C6BD6','heat-5':'#2B45B8','heat-ink-1':'#14171A','heat-ink-2':'#14171A','heat-ink-3':'#14171A','heat-ink-4':'#FFFFFF','heat-ink-5':'#FFFFFF','flow-in':'#96500F','flow-out':'#3B5BDB','flow-in-fill':'#B08A5C','flow-out-fill':'#7D8CC6','tile-1':'#DCE2F0','tile-2':'#C7D0E7','tile-3':'#ABB7D8','tile-4':'#8998C3','tile-5':'#7787AE','tile-ink':'#14171A'};
/** Every theme, in the order it is generated and offered. `scheme` sets color-scheme, border ink and native night mode. */
export const themes = [
 {id:'dark',label:'Dark',scheme:'dark',colors:dark},
 {id:'light',label:'Light',scheme:'light',colors:light},
 {id:'black',label:'True black',scheme:'dark',colors:{...dark,'surface-0':'#000000','surface-1':'#0A0B0C','surface-2':'#131517','surface-3':'#1C1F21','heat-ink-5':'#000000'}},
 {id:'paper',label:'Paper',scheme:'light',borders:[0.06,0.11],colors:{...light,'surface-0':'#EFE9DF','surface-1':'#F6F2EA','surface-2':'#E8E2D6','surface-3':'#DFD8CA','text-primary':'#221E1A','text-secondary':'#544D46','text-tertiary':'#877F77','accent':'#3450BE','positive':'#216B37','negative':'#A02928','warning':'#6F4B00','text-meta':'#534C46','accent-text':'#2C44A8','accent-solid':'#3450BE','positive-text':'#1C5E2F','negative-text':'#992727','warning-text':'#634300','border-control':'#766E65','flow-in-fill':'#A47D4E'}},
 {id:'contrast',label:'High contrast',scheme:'light',minText:7,borders:[0.16,0.42],colors:{...light,'surface-0':'#FFFFFF','surface-2':'#F1F2F3','surface-3':'#E5E7E9','text-primary':'#000000','text-secondary':'#2B3035','text-tertiary':'#3A4046','accent':'#1E3CB4','positive':'#0A5023','negative':'#861818','warning':'#5C3F00','text-meta':'#30363B','accent-text':'#1E3CB4','accent-solid':'#1E3CB4','positive-text':'#0A5023','negative-text':'#861818','warning-text':'#5C3F00','border-control':'#555C62','heat-1':'#CDD7F6','heat-2':'#ADBEF0','heat-3':'#8BA2E8','heat-4':'#2F4BC0','heat-5':'#1B2E8C','heat-ink-1':'#000000','heat-ink-2':'#000000','heat-ink-3':'#000000','flow-in':'#8A470C','flow-out':'#1E3CB4','flow-in-fill':'#A0703F','flow-out-fill':'#5E72C4','tile-1':'#E1E7F5','tile-2':'#CED7EE','tile-3':'#BAC6E7','tile-4':'#A5B4DF','tile-5':'#92A4D8','tile-ink':'#000000'}},
].map(theme => ({minText:4.5,borders:[0.06,0.11],...theme}));
const order = Object.keys(dark).join();
for (const theme of themes) if (Object.keys(theme.colors).join() !== order) throw new Error(`Theme ${theme.id} must use the same keys, in the same order, as dark.`);
const linear=v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export function contrast(a,b) {const lum=h=>{const [r,g,b]=rgb(h).map(linear);return 0.2126*r+0.7152*g+0.0722*b;};const l=[lum(a),lum(b)].sort((a,b)=>b-a);return (l[0]+0.05)/(l[1]+0.05);}
function oklch(hex){
 const [r,g,b]=rgb(hex).map(linear);
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 const L=.2104542553*l+.793617785*m-.0040720468*s,A=1.9779984951*l-2.428592205*m+.4505937099*s,B=.0259040371*l+.7827717662*m-.808675766*s;
 return `oklch(${(L*100).toFixed(5)}% ${Math.hypot(A,B).toFixed(6)} ${((Math.atan2(B,A)*180/Math.PI+360)%360).toFixed(4)})`;
}
// Colour-vision checks: Machado, Oliveira & Fernandes (2009) at full severity, in linear sRGB.
const MACHADO={
 protan:[[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 deutan:[[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 tritan:[[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
};
/** OKLab of linear sRGB, the space docs/CHART_PALETTE.md measures separation in. */
function oklab([r,g,b]){
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
/** Colour difference as OKLab distance ×100. */
const deltaE=(x,y)=>100*Math.hypot(x[0]-y[0],x[1]-y[1],x[2]-y[2]);
const seen=(hex,vision)=>{const lin=rgb(hex).map(linear);return oklab(vision?MACHADO[vision].map(row=>Math.min(1,Math.max(0,row[0]*lin[0]+row[1]*lin[1]+row[2]*lin[2]))):lin);};
const luminance=hex=>{const [r,g,b]=rgb(hex).map(linear);return 0.2126*r+0.7152*g+0.0722*b;};

/** Every generated file, and the gated rows that failed. Pure, so a test can feed it a broken palette. */
export function generate(list=themes){
 const failures=[];
 const row=(theme,pair,value,required,unit='')=>{const pass=value>=required;if(!pass)failures.push(`${theme} ${pair}`);return `| ${theme} | ${pair} | ${value.toFixed(2)}${unit} | ${required} | ${pass?'PASS':'FAIL'} |\n`;};
 let css='/* Generated by scripts/tokens.mjs. Edit the source palette, not this file. */\n';
 let report='# Contrast verification\n\nWCAG 2.x sRGB relative luminance ratios, evaluated against every surface. All body text uses accessible aliases. Raw tertiary tokens are retained from the brief but never used for text. Decorative dividers are exempt; input boundaries use border-control. Ratios below are minima across surfaces 0–3.\n\n| Theme | Pair | Minimum ratio | Required | Result |\n|---|---|---:|---:|---|\n';
 let charts='\n## Charts and graphics\n\nInk on chart fills meets the theme\'s text minimum; accent and flow marks meet 3:1 as graphics; flow pairs differ by ΔE 8 or more (OKLab ×100, as in CHART_PALETTE.md) under normal vision and simulated protan, deutan and tritan vision (Machado 2009, full severity); each ramp moves steadily one way in lightness.\n\n| Theme | Pair | Value | Required | Result |\n|---|---|---:|---:|---|\n';
 for (const {id,scheme,colors:tokens,minText,borders} of list) {
  css+=`[data-theme="${id}"] {\n  color-scheme: ${scheme};\n`;
  for(const [key,value] of Object.entries(tokens))css+=`  --${key}: ${oklch(value)};\n`;
  const ink=scheme==='dark'?'100% 0 0':'0% 0 0';
  css+=`  --border-subtle: oklch(${ink} / ${borders[0]});\n  --border-default: oklch(${ink} / ${borders[1]});\n}\n`;
  for(const key of ['text-primary','text-secondary','text-meta','accent-text','positive-text','negative-text','warning-text','border-control']){
   const ratio=Math.min(...[0,1,2,3].map(n=>contrast(tokens[key],tokens[`surface-${n}`])));
   report+=row(id,`${key} / surfaces`,ratio,key==='border-control'?3:minText);
  }
  report+=row(id,'on-accent / accent-solid',contrast(tokens['on-accent'],tokens['accent-solid']),minText);
  report+=`| ${id} | Requested raw tertiary / surface-0 (unused for text) | ${contrast(tokens['text-tertiary'],tokens['surface-0']).toFixed(2)} | 4.5 | N/A — replaced by text-meta |\n`;
  for(let n=1;n<=5;n++)charts+=row(id,`heat-ink-${n} / heat-${n}`,contrast(tokens[`heat-ink-${n}`],tokens[`heat-${n}`]),minText);
  charts+=row(id,'tile-ink / tiles 1–5',Math.min(...[1,2,3,4,5].map(n=>contrast(tokens['tile-ink'],tokens[`tile-${n}`]))),minText);
  charts+=row(id,'accent / surfaces',Math.min(...[0,1,2,3].map(n=>contrast(tokens.accent,tokens[`surface-${n}`]))),3);
  for(const key of ['flow-in','flow-out'])charts+=row(id,`${key} / surface-1`,contrast(tokens[key],tokens['surface-1']),3);
  for(const [a,b] of [['flow-in','flow-out'],['flow-in-fill','flow-out-fill']])
   charts+=row(id,`${a} vs ${b} ΔE (normal, protan, deutan, tritan)`,Math.min(...[null,'protan','deutan','tritan'].map(v=>deltaE(seen(tokens[a],v),seen(tokens[b],v)))),8);
  for(const ramp of ['heat','tile']){
   const steps=[1,2,3,4,5].map(n=>luminance(tokens[`${ramp}-${n}`])),up=steps.every((v,i)=>!i||v>steps[i-1]),down=steps.every((v,i)=>!i||v<steps[i-1]);
   charts+=`| ${id} | ${ramp} ramp 1→5 | ${up?'lighter':down?'darker':'mixed'} | steady | ${up||down?'PASS':'FAIL'} |\n`;if(!up&&!down)failures.push(`${id} ${ramp} ramp`);
  }
 }
 const registry='// Generated by scripts/tokens.mjs. Edit the source palette, not this file.\nexport const THEMES = [\n'+list.map(t=>`  {id: '${t.id}', label: '${t.label}', scheme: '${t.scheme}', background: '${t.colors['surface-0']}', swatch: {surface: '${t.colors['surface-1']}', ink: '${t.colors['text-primary']}', accent: '${t.colors.accent}'}},\n`).join('')+'] as const;\nexport type ThemeId = typeof THEMES[number][\'id\'];\n';
 const xml='<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by scripts/tokens.mjs. Edit the source palette, not this file. -->\n<resources>\n'+list.map(t=>`    <color name="kairos_bg_${t.id}">${t.colors['surface-0']}</color>\n`).join('')+'</resources>\n';
 return {css,report:report+charts,registry,xml,failures};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const out=generate();
 mkdirSync('src/ui/design',{recursive:true});mkdirSync('docs',{recursive:true});mkdirSync('android/app/src/main/res/values',{recursive:true});
 writeFileSync('src/ui/design/tokens.css',out.css);writeFileSync('docs/CONTRAST.md',out.report);
 writeFileSync('src/ui/design/theme-registry.ts',out.registry);writeFileSync('android/app/src/main/res/values/kairos_theme_colors.xml',out.xml);
 if(out.failures.length)throw new Error(`Contrast gate failed: ${out.failures.join('; ')}. Fix palette aliases.`);
}
