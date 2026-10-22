'use strict';
// Cluster PostgreSQL 17 novo, somente loopback, dados ficticios. Sem URL externa.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID:id}=require('node:crypto');
const {iniciar}=require('./fixtures/estoque-pg-local.cjs');
for(const k of Object.keys(process.env))if(k.startsWith('PG'))delete process.env[k];
test('PostgreSQL nativo: reenvio, parciais concorrentes, abertura, conciliacao e cancelamento',async t=>{
  assert.ok(process.env.EDR_POSTGRES_BIN,'Informe binarios locais PG17');
  const pg=await iniciar();t.after(()=>pg.parar());const owner=pg.conectar();
  for(const f of ['tests/fixtures/caixa-prospectivo-base.sql','sql/caixa-prospectivo-DRAFT.sql','sql/caixa-pagamento-sem-abertura-DRAFT.sql'])await owner.query(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
  const company=id(),admin=id(),cp=id(),cp2=id();
  await owner.query(`insert into companies(id) values('${company}'); insert into company_users(user_id,company_id,role,active) values('${admin}','${company}','admin',true); insert into contas_pagar(id,company_id,valor,status,tipo) values('${cp}','${company}',100,'pendente','despesa'),('${cp2}','${company}',100,'pendente','despesa');`);
  const connect=async()=>{const s=pg.conectar();await s.query(`set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`);return s;};
  const sql=(p,op)=>`select caixa_registrar('${op}','${JSON.stringify(p).replaceAll("'","''")}'::jsonb);`;
  const send=async(p,op=id())=>{const s=await connect();try{return await s.json(sql(p,op));}finally{await s.fechar();}};
  const read=async()=>{const s=await connect();try{return await s.json('select caixa_estado();');}finally{await s.fechar();}};
  const payment=(invoice,value=4000)=>({action:'movimento',tipo:'pagamento',conta_id:null,origem_codigo:'banco',conta_pagar_id:invoice,valor_centavos:value,data_efetiva:'2001-06-05',hora_efetiva:null,decisao_corte:null,descricao:'QA concorrente',pagamento_confirmado:true});
  const op=id(),p=payment(cp);const duplicate=await Promise.all([send(p,op),send(p,op)]);assert.deepEqual(duplicate[0],duplicate[1]);assert.equal((await read()).movimentos.length,1);
  const partial=await Promise.allSettled([send(payment(cp,4000)),send(payment(cp,4000))]);assert.equal(partial.filter(r=>r.status==='fulfilled').length,1);assert.equal((await read()).pagamentos.find(x=>x.conta_pagar_id===cp).restante_centavos,2000);
  // Segura a transacao do pagamento enquanto a abertura concorre pelo mesmo lock.
  const held=await connect();await held.query('begin;');const pre=await held.json(sql(payment(cp2,10000),id()));
  const opening={action:'abertura',corte_local:'2001-06-05T12:00',fuso:'America/Sao_Paulo',contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:10000}]};
  const openingPromise=send(opening);await held.query('commit;');await held.fechar();await openingPromise;
  let s=await read();assert.equal(s.total_centavos,110000);assert.equal(s.movimentos.find(x=>x.id===pre.movimento_id).decisao_corte,'pendente');
  const conc={action:'conciliar',movimento_id:pre.movimento_id,decisao_corte:'apos_corte'},cop=id();
  const same=await Promise.all([send(conc,cop),send(conc,cop)]);assert.deepEqual(same[0],same[1]);assert.equal((await read()).total_centavos,100000);
  const cancel={action:'cancelar',movimento_id:pre.movimento_id,motivo:'Estorno de registro QA'};
  const canceled=await Promise.allSettled([send(cancel),send(cancel)]);assert.equal(canceled.filter(x=>x.status==='fulfilled').length,1);assert.equal((await read()).total_centavos,110000);
  assert.equal((await read()).pagamentos.find(x=>x.conta_pagar_id===cp2).restante_centavos,10000);
  console.log(pg.versao+'; cluster sintetico encerrado ao finalizar; nenhuma chamada externa.');
});
