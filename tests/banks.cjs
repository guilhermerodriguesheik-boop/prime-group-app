const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'prime-banks-'));
for (const name of ['pluggy', 'sync']) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/banks', name + '.ts'), 'utf8');
  fs.writeFileSync(path.join(output, name + '.js'), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const { pluggyTransactions, meuPluggyConnector } = require(path.join(output, 'pluggy.js'));
const { syncBankConnection, allowPersonalItem } = require(path.join(output, 'sync.js'));
const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; fs.rmSync(output, { recursive: true }); });
const response = (data, status=200) => new Response(JSON.stringify(data), { status });
process.env.PLUGGY_CLIENT_ID = 'test-only';
process.env.PLUGGY_CLIENT_SECRET = 'test-only';
process.env.PLUGGY_PERSONAL_OWNER_ID = 'owner';
const connection = { id:'connection', owner_id:'owner', workspace_id:'workspace',
  provider_item_id:'item', status:'connected', display_name:'Test', last_synced_at:null };
function fakeDb() {
  const writes=[];
  const db={ from(table) {
    return { update(value) { writes.push({ table, value }); return this; },
      upsert(value) { writes.push({ table, value }); return this; },
      select() { return this; }, eq() { return this; }, in() { return this; },
      single() { return Promise.resolve({data:{id:'account'},error:null}); },
      then(resolve) { return Promise.resolve({error:null}).then(resolve); } };
  }};
  return { db, writes };
}
test('only the configured owner can use untagged personal items', () => {
  assert.equal(allowPersonalItem('owner', null), true);
  assert.equal(allowPersonalItem('other', null), false);
  assert.equal(allowPersonalItem('other', 'other'), false);
  assert.equal(allowPersonalItem('owner', 'other'), false);
});
test('cursor is followed unchanged and all pages are collected', async () => {
  const calls=[];
  global.fetch=async url=>{ calls.push(String(url)); return response(calls.length===1 ?
    {results:[{id:'one'}],next:'?accountId=account&after=opaque%2Bcursor'} : {results:[{id:'two'}],next:null}); };
  assert.equal((await pluggyTransactions('key','account','2026-01-01')).length,2);
  assert.equal(calls[1],'https://api.pluggy.ai/v2/transactions?accountId=account&after=opaque%2Bcursor');
});
test('a cursor cannot switch to another account', async () => {
  global.fetch=async()=>response({results:[],next:'?accountId=other&after=x'});
  await assert.rejects(()=>pluggyTransactions('key','account','2026-01-01'),/outra conta/);
});
test('Meu Pluggy connector ID is discovered, never assumed', async () => {
  global.fetch=async()=>response({results:[{id:999,name:'Meu Pluggy'}]});
  assert.equal(await meuPluggyConnector('key'),999);
  global.fetch=async()=>response({results:[{id:123,name:'Itaú'}]});
  await assert.rejects(()=>meuPluggyConnector('key'),/não disponível/);
});
test('sync rejects a forged item before requesting financial data', async () => {
  const calls=[];
  global.fetch=async url=>{ calls.push(String(url)); return response(calls.length===1 ?
    {apiKey:'key'} : {id:'item',clientUserId:'other',status:'UPDATED'}); };
  const {db,writes}=fakeDb();
  await assert.rejects(()=>syncBankConnection(db,connection),/não autorizado/);
  assert.equal(calls.length,2);
  assert.equal(writes[0].value.status,'attention');
  assert.equal(writes.some(w=>w.table==='bank_accounts'),false);
});
test('provider auth and expired consent errors are saved as attention', async () => {
  global.fetch=async()=>response({},401);
  const first=fakeDb();
  await assert.rejects(()=>syncBankConnection(first.db,connection),/HTTP 401/);
  assert.equal(first.writes[0].value.status,'attention');
  global.fetch=async url=>response(String(url).endsWith('/auth') ? {apiKey:'key'} :
    {id:'item',clientUserId:'owner',status:'LOGIN_ERROR'});
  const second=fakeDb();
  await assert.rejects(()=>syncBankConnection(second.db,connection),/atenção/);
  assert.equal(second.writes[0].value.status,'attention');
});
test('valid sync writes bank staging only and uses explicit debit/credit direction', async () => {
  global.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname==='/auth')return response({apiKey:'key'});
    if(u.pathname==='/items/item')return response({id:'item',clientUserId:'owner',status:'UPDATED'});
    if(u.pathname==='/accounts')return response({results:[{id:'a',type:'CREDIT',balance:100}]});
    return response({results:[{id:'t',date:'2026-10-13',amount:100,type:'DEBIT',status:'POSTED'}],next:null});
  };
  const {db,writes}=fakeDb();
  const result=await syncBankConnection(db,connection);
  assert.equal(result.transactions,1);
  assert.equal(result.newTransactions,1);
  assert.equal(result.providerUpdatedAt,null);
  assert.equal(writes.find(w=>w.table==='bank_connections').value.last_new_transaction_count,1);
  assert.equal(writes.find(w=>w.table==='bank_transactions').value[0].direction,'debit');
  assert.deepEqual([...new Set(writes.map(w=>w.table))],['bank_accounts','bank_transactions','bank_connections']);
});

test('Pluggy lastUpdatedAt is stored distinctly from local import time', async () => {
 global.fetch=async url=>{
  const p=new URL(url).pathname;
  if(p==='/auth')return response({apiKey:'key'});
  if(p==='/items/item')return response({
   id:'item',clientUserId:'owner',status:'UPDATED',lastUpdatedAt:'2026-10-16T13:00:00.000Z'});
  if(p==='/accounts')return response({results:[{id:'a',type:'BANK',balance:1200}]});
  return response({results:[],next:null});
 };
 const {db,writes}=fakeDb();
 const result=await syncBankConnection(db,connection);
 assert.equal(result.transactions,0);
 assert.equal(result.newTransactions,0);
 assert.equal(result.providerUpdatedAt,'2026-10-16T13:00:00.000Z');
 const metadata=writes.find(w=>w.table==='bank_connections').value;
 assert.equal(metadata.provider_last_updated_at,'2026-10-16T13:00:00.000Z');
 assert.ok(metadata.last_synced_at!==metadata.provider_last_updated_at);
});
