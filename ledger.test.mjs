import assert from 'node:assert/strict';
import { cents, parseCsv, candidates, totals } from './ledger.mjs';

assert.equal(cents('12.3'),1230);assert.throws(()=>cents('12.345'));
assert.deepEqual(parseCsv('\uFEFFdate,merchant,amount\r\n2025-01-01,"Shop, #1","1,000.00"'),[['date','merchant','amount'],['2025-01-01','Shop, #1','1,000.00']]);
assert.throws(()=>parseCsv('a,"unterminated'));
const tx=(id,importId,merchant,amountCents,type='expense',date='2025-01-01')=>({id,importId,merchant,amountCents,type,date,currency:'CNY'});
const today=new Date().toISOString().slice(0,10),imports=[{id:'i1',source:'支付宝'},{id:'i2',source:'银行'}], a=tx('a','i1','零食很忙',11779,'expense',today),b=tx('b','i2','零食很忙',11779,'expense',today);
assert.equal(candidates([a,b],[],imports).length,1,'cross-source candidate');
assert.equal(candidates([a,tx('c','i2','零食很忙',11779)],[],[{id:'i1',source:'支付宝'},{id:'i2',source:'支付宝'}]).length,0,'same source not cross-matched');
assert.equal(candidates([a,tx('c','i2','其他商户',11779)],[],imports).length,0,'merchant mismatch not merged');
const refund=tx('r','i2','零食很忙',500,'refund','2025-06-01');assert.equal(candidates([a,refund],[],imports)[0].kind,'refund','cross-month partial refund candidate');
assert.equal(totals([a,b],[{a:'a',b:'b',kind:'same'}]).summary.expenseCents,11779,'confirmed match counts once');const mixed=totals([a,{...tx('usd','i3','shop',200,'expense',today),currency:'USD'}]).summary;assert.equal(mixed.expenseCents,11779,'legacy aggregate is CNY only');assert.equal(mixed.currencies.USD.monthExpenseCents,200,'foreign currency stays separate');
const bank={id:'bank',name:'借记卡',type:'银行卡',currency:'CNY',openingCents:100000};
assert.equal(totals([tx('x','i','shop',110)],[],[bank]).accountBalances.bank,100000,'unlinked transaction does not alter account balance');
console.log('Ledger core tests passed');
