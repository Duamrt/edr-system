'use strict';
// Concorrência real: cluster NOVO e descartável, somente 127.0.0.1.
// Não aceita conexão, usuário ou credencial de servidor existente.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0');
const empresa=id(1),admin=id(2),nf=id(3),origem=id(4);
const literal=x=>"'"+String(x).replace(/'/g,"''")+"'";
const resultado=p=>p.then(valor=>({ok:true,valor}),erro=>({ok:false,erro}));
if(!process.env.EDR_POSTGRES_BIN){
  test('parcelamento: concorrência PostgreSQL nativo',{skip:'Defina EDR_POSTGRES_BIN; não testado em conexões independentes'},()=>{});
}else{
  for(const k of Object.keys(process.env))if(k.startsWith('PG'))delete process.env[k];
  const {iniciar}=require('./fixtures/estoque-pg-local.cjs');
  const base=fs.readFileSync(path.join(__dirname,'fixtures/contas-parcelamento-base.sql'),'utf8')
    .replace(/^create role (authenticated|anon);\r?\n/gm,'');
  const migration=fs.readFileSync(path.join(__dirname,'../sql/contas-parcelamento-DRAFT.sql'),'utf8');
  let pg,controle,n=0;
  test.before(async()=>{pg=await iniciar();controle=pg.conectar('postgres','parcelas_controle');
    await controle.query('create role authenticated; create role anon;');
    console.log('PARCELAMENTO NATIVO '+pg.versao+'; cluster descartável '+pg.pasta);});
  test.after(async()=>{if(pg)await pg.parar();});
  async function preparar(t,split=false){
    const banco='parcelas_t'+(++n);await controle.query('create database '+banco+';');
    const obs=pg.conectar(banco,banco+'_obs'),sessoes=[obs];
    t.after(async()=>{for(const s of sessoes){if(s.pendente)s.destruir();else await s.fechar();}});
    await obs.query(base+'\n'+migration);
    for(const tabela of ['obras','notas_fiscais','contas_pagar','lancamentos','caixa_obrigacoes','caixa_movimentos']){
      await obs.query(`alter table ${tabela} enable row level security;
        create policy tenant on ${tabela} to authenticated using(company_id=auth_company_id())
          with check(company_id=auth_company_id() and auth_user_role()='admin');
        grant select,insert,update,delete on ${tabela} to authenticated;`);
    }
    await obs.query(`insert into companies values('${empresa}');
      insert into company_users(user_id,company_id,role) values('${admin}','${empresa}','admin');
      insert into notas_fiscais(id,company_id,numero_nf,fornecedor,valor_bruto) values('${nf}','${empresa}','321/1','FORNECEDOR SINTÉTICO',1854.17);`);
    let cp;
    if(split){
      await obs.query(`insert into contas_pagar(id,company_id,nota_id,nota_ref,fornecedor,descricao,valor,data_vencimento,status)
        values('${origem}','${empresa}','${nf}','321/1','FORNECEDOR SINTÉTICO','Conta sintética',1854.17,'2026-10-28','pendente');`);
      cp=await obs.json(`select to_jsonb(c) from contas_pagar c where id='${origem}';`);
    }
    async function sessao(nome){
      const s=pg.conectar(banco,banco+'_'+nome);sessoes.push(s);
      await s.query(`select set_config('request.jwt.claim.sub','${admin}',false); set role authenticated;`);
      s.pid=await s.json('select to_json(pg_backend_pid());');return s;
    }
    const a=await sessao('a'),b=await sessao('b');assert.notEqual(a.pid,b.pid);
    const p={modo:split?'desdobrar':'nota',nota_id:nf,conta_id:split?origem:null,descricao:'Conta sintética',
      status:'pendente',obra_id:null,parcelas:[
        {numero:'A',valor_centavos:90001,vencimento:'2026-10-28'},
        {numero:'B',valor_centavos:95416,vencimento:'2026-11-28'}],
      motivo:'Conferência sintética',original:split?{
        valor_centavos:185417,status:cp.status,data_vencimento:cp.data_vencimento,
        fornecedor:cp.fornecedor,descricao:cp.descricao,obra_id:null,nota_id:nf,nota_ref:'321/1'}:null};
    const rpc=(op=id(20),pedido=p)=>`select registrar_parcelas_conta('${op}',${literal(JSON.stringify(pedido))}::jsonb);`;
    const estado=()=>obs.json(`select json_build_object('n',(select count(*) from contas_pagar),
      'total',(select coalesce(sum(valor),0) from contas_pagar),'nf',(select count(*) from notas_fiscais));`);
    async function bloqueado(s){
      for(let i=0;i<40;i++){
        const r=await obs.json(`select coalesce((select to_json(wait_event_type='Lock') from pg_stat_activity where pid=${s.pid}),'false'::json);`);
        if(r)return;
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      assert.fail('A segunda conexão não aguardou o lock esperado');
    }
    return{obs,a,b,p,rpc,estado,bloqueado};
  }
  test('mesmo UUID em duas conexões cria uma cobrança e replay usa contas atuais',async t=>{
    const q=await preparar(t);await q.a.query('begin;');const primeiro=await q.a.json(q.rpc());
    const outro=resultado(q.b.json(q.rpc()));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,true,r.erro?.message);assert.equal(r.valor.repetida,true);
    assert.deepEqual(r.valor.contas.map(x=>x.id),primeiro.contas.map(x=>x.id));
    assert.deepEqual(await q.estado(),{n:2,total:1854.17,nf:1});
  });
  test('UUIDs distintos para a mesma NF concorrem sem duplicar',async t=>{
    const q=await preparar(t);await q.a.query('begin;');await q.a.json(q.rpc());
    const outro=resultado(q.b.json(q.rpc(id(21))));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/já possui conta/);
    assert.deepEqual(await q.estado(),{n:2,total:1854.17,nf:1});
  });
  test('dois desdobramentos da mesma conta rejeitam snapshot obsoleto',async t=>{
    const q=await preparar(t,true);await q.a.query('begin;');await q.a.json(q.rpc());
    const outro=resultado(q.b.json(q.rpc(id(21))));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/alterada após/);
    assert.deepEqual(await q.estado(),{n:2,total:1854.17,nf:1});
  });
  test('baixa concorrente termina antes da conferência: conta paga não é substituída',async t=>{
    const q=await preparar(t,true);await q.a.query(`begin;
      select pg_advisory_xact_lock(hashtextextended('${empresa}:caixa-prospectivo',0));
      select id from contas_pagar where id='${origem}' for update;
      update contas_pagar set status='pago',data_pagamento='2026-10-20' where id='${origem}';
      insert into caixa_obrigacoes values('${empresa}','${origem}',185417);`);
    const outro=resultado(q.b.json(q.rpc()));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/pendente sem pagamento/);
    assert.deepEqual(await q.estado(),{n:1,total:1854.17,nf:1});
  });
  test('exclusão concorrente da NF vence: prompt atrasado não cria conta órfã',async t=>{
    const q=await preparar(t);await q.a.query(`begin; delete from notas_fiscais where id='${nf}';`);
    const outro=resultado(q.b.json(q.rpc()));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/Nota fiscal removida/);
    assert.deepEqual(await q.estado(),{n:0,total:0,nf:0});
  });
  test('registro financeiro vence: DELETE concorrente da NF preserva contas e recibos',async t=>{
    const q=await preparar(t);await q.a.query('begin;');await q.a.json(q.rpc());
    const outro=resultado(q.b.query(`delete from notas_fiscais where id='${nf}';`));
    await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/preserve o registro/);
    assert.deepEqual(await q.estado(),{n:2,total:1854.17,nf:1});
  });
  const insertLegado=`insert into contas_pagar(company_id,nota_id,nota_ref,fornecedor,descricao,valor,data_vencimento,status)
    values('${empresa}','${nf}','321/1','FORNECEDOR SINTÉTICO','Modal antigo',1854.17,'2026-10-28','pendente');`;
  test('RPC vence INSERT concorrente da aba antiga: total não é duplicado',async t=>{
    const q=await preparar(t);await q.a.query('begin;');await q.a.json(q.rpc());
    const outro=resultado(q.b.query(insertLegado));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/já possui parcelamento/);
    assert.deepEqual(await q.estado(),{n:2,total:1854.17,nf:1});
  });
  test('INSERT da aba antiga vence RPC concorrente: nova operação exige revisar conta existente',async t=>{
    const q=await preparar(t);await q.a.query('begin;'+insertLegado);
    const outro=resultado(q.b.json(q.rpc()));await q.bloqueado(q.b);await q.a.query('commit;');
    const r=await outro;assert.equal(r.ok,false);assert.match(r.erro.message,/já possui conta/);
    assert.deepEqual(await q.estado(),{n:1,total:1854.17,nf:1});
  });
}
