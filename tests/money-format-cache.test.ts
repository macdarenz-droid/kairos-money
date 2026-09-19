import {expect,it,vi} from 'vitest';
import {format,money} from '../src/core/money';
function observeConstructors(){
 const Original=Intl.NumberFormat;
 return vi.spyOn(Intl,'NumberFormat').mockImplementation((locale,options)=>new Original(locale,options));
}

it('reuses currency configuration while formatting distinct amounts exactly',()=>{
 const constructor=observeConstructors();
 try{
  expect(format(money(123456n,'AUD'))).toBe('$1,234.56');
  expect(format(money(-1n,'AUD'))).toBe('-$0.01');
  expect(format(money(9007199254740991n,'AUD'))).toBe('$90,071,992,547,409.91');
  expect(format(money(0n,'AUD'))).toBe('$0.00');
  expect(constructor).toHaveBeenCalledTimes(1);
  expect(format(money(1n,'KWD'),'en-US')).toBe('KWD\u00a00.001');
  expect(format(money(1234n,'JPY'),'en-US')).toBe('¥1,234');
  expect(format(money(123456n,'EUR'),'de-DE')).toBe('1.234,56\u00a0€');
  expect(format(money(-1n,'KWD'),'en-US')).toBe('-KWD\u00a00.001');
  expect(constructor).toHaveBeenCalledTimes(4);
 }finally{constructor.mockRestore();}
});

it('bounds configuration retention without changing values after eviction',()=>{
 const locales=Array.from({length:40},(_,i)=>`en-${String.fromCharCode(65+Math.floor(i/26))}${String.fromCharCode(65+i%26)}`);
 const first=format(money(-1n,'USD'),locales[0]);
 for(const locale of locales)format(money(98765n,'USD'),locale);
 const constructor=observeConstructors();
 try{
  expect(format(money(-1n,'USD'),locales[0])).toBe(first);
  expect(constructor).toHaveBeenCalledTimes(1);
 }finally{constructor.mockRestore();}
});
