import {expect,it} from 'vitest';
import {insertRows} from '../src/core/db/write-rows';
import type {Driver} from '../src/core/db/driver';
import {memoryDriver} from './db-helper';

it('writes every row, in order, with far fewer native calls than rows',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  raw.exec('CREATE TABLE signal(id TEXT PRIMARY KEY NOT NULL, period TEXT NOT NULL, value TEXT)');
  const statements:string[]=[];
  const bridge:Driver={...driver,async execute(sql,values){statements.push(sql);return driver.execute(sql,values);}};
  const rows=Array.from({length:500},(_,i)=>[`s-${String(i).padStart(3,'0')}`,'trailing-90',`café 🧾 ${i}`]);
  await insertRows(bridge,'INSERT OR REPLACE INTO signal(id,period,value)',rows);
  expect(await driver.query('SELECT id,period,value FROM signal ORDER BY id')).toEqual(rows.map(([id,period,value])=>({id,period,value})));
  expect(statements.length).toBeLessThan(rows.length/100);
 }finally{raw.close();}
});

it('keeps replace semantics, stays inside SQLite’s bound-parameter ceiling and writes nothing for no rows',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  raw.exec('CREATE TABLE signal(id TEXT PRIMARY KEY NOT NULL, value TEXT)');
  let calls=0;
  const bridge:Driver={...driver,async execute(sql,values){calls++;expect((values??[]).length).toBeLessThanOrEqual(999);return driver.execute(sql,values);}};
  await insertRows(bridge,'INSERT OR REPLACE INTO signal(id,value)',[]);
  expect(calls).toBe(0);
  // A later row for the same id replaces the earlier one, exactly as one statement per row did.
  await insertRows(bridge,'INSERT OR REPLACE INTO signal(id,value)',[['a','first'],['b','kept'],['a','second']]);
  expect(await driver.query('SELECT id,value FROM signal ORDER BY id')).toEqual([{id:'a',value:'second'},{id:'b',value:'kept'}]);
  await insertRows(bridge,'INSERT OR REPLACE INTO signal(id,value)',Array.from({length:800},(_,i)=>[`w-${i}`,'wide']));
  expect((await driver.query('SELECT COUNT(*) AS n FROM signal'))[0]!.n).toBe(802);
 }finally{raw.close();}
});

it('refuses ragged rows rather than writing a misaligned statement',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  raw.exec('CREATE TABLE signal(id TEXT PRIMARY KEY NOT NULL, value TEXT)');
  await expect(insertRows(driver,'INSERT INTO signal(id,value)',[['a','one'],['b']])).rejects.toThrow('Every inserted row needs the same columns.');
  expect(await driver.query('SELECT id FROM signal')).toEqual([]);
 }finally{raw.close();}
});
