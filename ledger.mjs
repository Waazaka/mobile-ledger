export function cents(value) {
  if (typeof value !== 'string' || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) throw Error('金额格式无效（最多两位小数）');
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c; }
    else if (c === '"' && !field) quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); if (row.some(x => x !== '')) rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (quoted) throw Error('CSV 引号未闭合');
  row.push(field); if (row.some(x => x !== '')) rows.push(row);
  if (!rows.length) throw Error('CSV 文件为空');
  return rows;
}

const norm = s => String(s || '').toLowerCase().replace(/[\s*#。，,._-]/g, '');
function merchantNear(a, b) { const x = norm(a), y = norm(b); return x && y && (x === y || x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))); }
function dayDiff(a, b) { if (!a || !b) return 99; return Math.abs(Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000; }

export function candidates(transactions, decisions = [], imports = []) {
  const decided = new Set(decisions.map(x => [x.a, x.b].sort().join(':'))), out = [];
  // ponytail: pairwise review scans only 1,000 newest transactions; index by amount/date if personal history grows past that ceiling.
  const recent=[...transactions].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,1000);
  for (let i = 0; i < recent.length; i++) for (let j = i + 1; j < recent.length; j++) {
    const a = recent[i], b = recent[j];
    if (a.importId === b.importId || (a.currency || 'CNY') !== (b.currency || 'CNY')) continue;
    if (decided.has([a.id, b.id].sort().join(':'))) continue;
    let kind, reason;
    if (a.type === 'refund' && b.type === 'expense' || b.type === 'refund' && a.type === 'expense') {
      const refund = a.type === 'refund' ? a : b, expense = a.type === 'expense' ? a : b;
      if (refund.amountCents > expense.amountCents) continue;
      kind = 'refund'; reason = '退款与消费金额/商户候选，需人工确认原订单';
      if (!merchantNear(refund.merchant, expense.merchant)) continue;
    } else {
      if (!['expense','income','refund'].includes(a.type) || a.type !== b.type || a.amountCents !== b.amountCents || dayDiff(a.date,b.date)>2 || !merchantNear(a.merchant,b.merchant)) continue;
      const ia=imports.find(x=>x.id===a.importId), ib=imports.find(x=>x.id===b.importId);
      if (ia?.source===ib?.source) continue;
      kind='same'; reason='跨来源、同金额/方向、日期相近且商户名称相似；不是自动合并';
    }
    out.push({a:a.id,b:b.id,kind,reason,score:'候选（需人工判断）'});
  }
  return out;
}

export function uniqueTransactions(transactions, decisions = []) {
  const parent = new Map(transactions.map(t => [t.id,t.id]));
  const root = x => { let p=parent.get(x); while (p && p!==parent.get(p)) p=parent.get(p); if (p) parent.set(x,p); return p; };
  for (const d of decisions.filter(x=>x.kind==='same')) { if(parent.has(d.a)&&parent.has(d.b)) parent.set(root(d.b),root(d.a)); }
  const seen=new Set();return transactions.filter(t=>{const key=root(t.id);if(seen.has(key))return false;seen.add(key);return true});
}

export function totals(transactions, decisions = [], accounts = []) {
  const unique=uniqueTransactions(transactions,decisions),month=new Date().toISOString().slice(0,7),summary={month,expenseCents:0,refundCents:0,netCents:0,incomeCents:0,transactions:unique.length,currencies:{}};
  const accountBalances=Object.fromEntries(accounts.map(a=>[a.id,Number(a.openingCents||0)]));
  for(const t of unique){
    const cur=t.currency||'CNY',amount=Number(t.amountCents)||0,monthMatch=(t.date||'').startsWith(month),bucket=summary.currencies[cur]||=(
      {expenseCents:0,refundCents:0,incomeCents:0,monthExpenseCents:0,monthRefundCents:0,monthIncomeCents:0});
    if(t.type==='expense'){bucket.expenseCents+=amount;if(monthMatch){bucket.monthExpenseCents+=amount;if(cur==='CNY')summary.expenseCents+=amount;}}
    if(t.type==='refund'){bucket.refundCents+=amount;if(monthMatch){bucket.monthRefundCents+=amount;if(cur==='CNY')summary.refundCents+=amount;}}
    if(t.type==='income'){bucket.incomeCents+=amount;if(monthMatch){bucket.monthIncomeCents+=amount;if(cur==='CNY')summary.incomeCents+=amount;}}
    const account=accounts.find(a=>a.id===t.accountId),balance=accountBalances[t.accountId];
    if(account&&Number.isSafeInteger(balance)&&account.currency===cur&&(!account.asOf||t.date&&t.date>account.asOf)){const liability=['信用卡','花呗'].includes(account.type);if(t.type==='expense')accountBalances[t.accountId]+=liability?amount:-amount;if(t.type==='refund')accountBalances[t.accountId]+=liability?-amount:amount;if(t.type==='income'&&!liability)accountBalances[t.accountId]+=amount;}
  }
  summary.netCents=summary.expenseCents-summary.refundCents;return {summary,accountBalances};
}
