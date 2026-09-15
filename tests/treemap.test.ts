import {expect,it} from 'vitest';
import {categoryTiles} from '../src/intelligence/visuals/treemap';
it('partitions the chart without overlaps and preserves amount proportions',()=>{
 const tiles=categoryTiles([{name:'Rent',minor:'60000'},{name:'Food',minor:'30000'},{name:'Other',minor:'10000'}]);
 expect(tiles.reduce((sum,t)=>sum+t.width*t.height,0)).toBeCloseTo(600000);
 for(const tile of tiles){expect(tile.width*tile.height/600000).toBeCloseTo(Number(tile.minor)/100000,4);for(const other of tiles.filter(t=>t!==tile))expect(tile.x+tile.width<=other.x||other.x+other.width<=tile.x||tile.y+tile.height<=other.y||other.y+other.height<=tile.y).toBe(true);}
 expect(categoryTiles([])).toEqual([]);
 expect(categoryTiles([{name:'Zero',minor:'0'}])).toEqual([]);
});
