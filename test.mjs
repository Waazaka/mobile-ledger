import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';

const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-m1-'));
const port=21000+crypto.randomInt(10000), base=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),LEDGER_PASSWORD:'test-password',LEDGER_SESSION_SECRET:'s'.repeat(40),LEDGER_KEY_SECRET:'k'.repeat(40)};
const child=spawn(process.execPath,[path.join(import.meta.dirname,'server.mjs')],{cwd,env,stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(route,body,token,method='POST'){let res=await fetch(base+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return [res,await res.json()]}
try {
 let ready=false;for(let n=0;n<50;n++){try{await fetch(base);ready=true;break}catch{await wait(100)}}assert(ready,'server starts');
 let [r,d]=await request('/api/state',undefined);assert.equal(r.status,401,'API protected');
 [r,d]=await request('/api/login',{password:'test-password'});assert.equal(r.status,200);const token=d.token;
 [r,d]=await request('/api/accounts',{name:'银行卡',type:'银行卡'},token);assert.equal(r.status,201);
 const data='data:image/png;base64,aGVsbG8=';
 [r,d]=await request('/api/import',{imageData:data,mime:'image/png',source:'测试',anchor:'2025-01-01'},token);assert.equal(r.status,200);const importId=d.id;
 [r,d]=await request('/api/import',{imageData:data,mime:'image/png',source:'测试'},token);assert.equal(d.duplicate,true,'identical upload is idempotent');
 [r,d]=await request(`/api/import/${importId}/confirm`,{records:[{merchant:'示例',date:'2025-01-01',amount:'1.10',type:'expense'}]},token);assert.equal(d.saved,1);
 [r,d]=await request('/api/state',undefined,token,'GET');assert.equal(d.transactions.length,1);assert.equal(d.transactions[0].amountCents,110);
 [r,d]=await request(`/api/import/${importId}/confirm`,{records:[{amount:'1.00'}]},token);assert.equal(r.status,400,'confirmed import cannot be duplicated');
 [r,d]=await request('/api/import/'+importId+'/confirm',{records:[{merchant:'x',amount:'1.001'}]},token);assert.equal(r.status,400,'fractional precision validated');
 [r,d]=await request('/api/providers',{name:'bad',baseUrl:'http://127.0.0.1',model:'x'},token);assert.equal(r.status,400,'non-HTTPS rejected');
 console.log('M1 smoke tests passed');
} finally {child.kill();await wait(100);fs.rmSync(cwd,{recursive:true,force:true})}
