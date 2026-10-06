'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');

// Ensaio NATIVO: cluster novo e descartavel, criado pelo harness existente.
// Nao recebe URL/host/credencial de banco existente. Listener somente 127.0.0.1;
// processos Windows ocultos; conexoes e cluster encerrados em after/finally.
// EDR_POSTGRES_BIN=<pasta de binarios PG17 ja instalada> node --test <este arquivo>
if(!process.env.EDR_POSTGRES_BIN){
  test('caixa: concorrência PostgreSQL nativo',{skip:'Defina EDR_POSTGRES_BIN; nao houve teste nativo concorrente.'},()=>{});
}else{
  // Evitar que configuracao libpq herdada (PGSERVICE/PGHOSTADDR etc.) encaminhe
  // clientes a outro servidor. A alteracao vale apenas para este processo teste.
  for(const chave of Object.keys(process.env))if(chave.startsWith('PG'))delete process.env[chave];
  const {iniciar}=require('./fixtures/estoque-pg-local.cjs');
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/caixa-prospectivo-base.sql'),'utf8')
    .replace(/^create role (anon|authenticated);\r?\n/gm,'');
  const migration=fs.readFileSync(path.join(__dirname,'../sql/caixa-prospectivo-DRAFT.sql'),'utf8');
  const rollback=fs.readFileSync(path.join(__dirname,'../sql/caixa-prospectivo-rollback-DRAFT.sql'),'utf8');
  const empresa='00000000-0000-4000-8000-000000000001';
  const admin='00000000-0000-4000-8000-000000000003';
  const literal=v=>v==null?'null':"'"+String(v).replace(/'/g,"''")+"'";
  const sucesso=p=>p.then(valor=>({ok:true,valor}),erro=>({ok:false,erro}));
  const confirmar=r=>{assert.equal(r.ok,true,r.erro?.message);return r.valor};
  const falha=(r,regex)=>{assert.equal(r.ok,false);assert.match(r.erro.message,regex)};
  let pg,controle,numero=0;

  test.before(async()=>{
    pg=await iniciar();console.log('CAIXA NATIVO '+pg.versao+'; listener 127.0.0.1; cluster '+pg.pasta);
    controle=pg.conectar('postgres','edr_caixa_controle');await controle.query('create role anon; create role authenticated;');
  });
  test.after(async()=>{if(pg)await pg.parar()});

  async function ambiente(t,abrir=true){
    const banco='edr_caixa_t'+(++numero);await controle.query('create database '+banco+';');
    const obs=pg.conectar(banco,banco+'_observador');const sessoes=[obs];
    t.after(async()=>{for(const s of sessoes){if(s.pendente)s.destruir();else await s.fechar()}});
    await obs.query(fixture+'\n'+migration);
    await obs.query(`insert into companies(id) values('${empresa}');
      insert into company_users(user_id,company_id,role) values('${admin}','${empresa}','admin');
      select set_config('request.jwt.claim.sub','${admin}',false);`);
    async function sessao(nome){
      const s=pg.conectar(banco,banco+'_'+nome);sessoes.push(s);
      await s.query(`select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;`);return s;
    }
    const primeira=await sessao('primeira'),segunda=await sessao('segunda');
    const pid1=await primeira.json('select to_json(pg_backend_pid());'),pid2=await segunda.json('select to_json(pg_backend_pid());');
    assert.notEqual(pid1,pid2,'Disputa deve usar conexoes PostgreSQL independentes');
    const rpc=(pedido,uuid=randomUUID())=>`select public.caixa_registrar(${literal(uuid)}::uuid,${literal(JSON.stringify(pedido))}::jsonb);`;
    const abertura={action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',
      contas:[{codigo:'banco',nome:'Banco QA nativo',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA nativo',saldo_centavos:20000}]};
    if(abrir)await primeira.json(rpc(abertura));
    const estado=()=>obs.json('select public.caixa_estado();');
    const contas=(await estado()).contas;
    const pedido=extra=>({action:'movimento',tipo:'saida',conta_id:contas[0].id,destino_id:null,valor_centavos:1000,
      data_efetiva:'2001-06-06',hora_efetiva:null,decisao_corte:null,descricao:'Movimento QA nativo',conta_pagar_id:null,...extra});
    const cancelar=r=>({action:'cancelar',movimento_id:r.movimento_id,motivo:'Cancelamento QA nativo'});
    const conta=async()=>{
      const cp=randomUUID();await obs.query(`insert into contas_pagar(id,company_id,valor,status,tipo,data_vencimento,descricao)
        values('${cp}','${empresa}',100,'pendente','despesa','2000-12-01','Obrigacao QA nativa antiga');`);return cp;
    };
    const totais=()=>obs.json(`select json_build_object(
      'movimentos',(select count(*) from caixa_movimentos),
      'ativos',(select count(*) from caixa_movimentos where cancelado_em is null),
      'recibos_movimento',(select count(*) from caixa_operacoes where pedido->>'action'='movimento'),
      'recibos_cancelamento',(select count(*) from caixa_operacoes where pedido->>'action'='cancelar'),
      'custos',(select count(*) from lancamentos),'custo',(select sum(total) from lancamentos),
      'saldo_manual',(select saldo_manual from companies where id='${empresa}'),
      'folha',(select status from diarias_quinzenas where id=1),'estoque',(select qtd from distribuicoes where id=1));`);
    const obrigacao=cp=>obs.json(`select json_build_object('status',status,'data_pagamento',data_pagamento)
      from contas_pagar where id=${literal(cp)}::uuid;`);
    async function esperarBloqueio(){
      const fim=Date.now()+5000;
      do{
        const r=await obs.json(`select json_build_object('pid',pid,'espera',wait_event_type,'bloqueadores',pg_blocking_pids(pid))
          from pg_stat_activity where pid=${pid2};`);
        if(r?.espera==='Lock'&&r.bloqueadores.includes(pid1)){
          assert.equal(r.pid,pid2);t.diagnostic('Conexoes independentes: PID '+pid2+' bloqueado por PID '+pid1);return r;
        }
        await new Promise(resolve=>setTimeout(resolve,25));
      }while(Date.now()<fim);
      throw Error('Nao observou espera real de PID '+pid2+' por PID '+pid1);
    }
    async function preservar(){
      const s=await totais();assert.equal(s.custos,1);assert.equal(s.custo,91.23);
      assert.equal(s.saldo_manual,123.45);assert.equal(s.folha,'fechada');assert.equal(s.estoque,7);return s;
    }
    return{obs,primeira,segunda,pid1,pid2,rpc,abertura,pedido,cancelar,conta,contas,estado,totais,obrigacao,esperarBloqueio,preservar};
  }
  const saldos=s=>s.contas.map(c=>c.saldo_centavos);

  test('PG nativo: mesmo UUID simultâneo espera lock e gera um movimento/recibo',{timeout:25000},async t=>{
    const a=await ambiente(t);const p=a.pedido({tipo:'entrada'}),uuid=randomUUID();
    await a.primeira.query('begin;');const r=await a.primeira.json(a.rpc(p,uuid));
    const disputa=sucesso(a.segunda.json(a.rpc(p,uuid)));await a.esperarBloqueio();
    assert.equal((await a.estado()).movimentos.length,0);assert.equal((await a.estado()).total_centavos,120000);
    await a.primeira.query('commit;');assert.deepEqual(confirmar(await disputa),r);assert.equal(r.company_id,empresa);
    const s=await a.estado();assert.deepEqual(saldos(s),[101000,20000]);assert.equal(s.total_centavos,121000);
    const n=await a.preservar();assert.equal(n.movimentos,1);assert.equal(n.recibos_movimento,1);
  });

  test('PG nativo: UUID simultâneo com payload divergente rejeita sem repetir saldo',{timeout:25000},async t=>{
    const a=await ambiente(t);const p=a.pedido(),uuid=randomUUID();await a.primeira.query('begin;');await a.primeira.json(a.rpc(p,uuid));
    const disputa=sucesso(a.segunda.json(a.rpc({...p,valor_centavos:2000},uuid)));await a.esperarBloqueio();await a.primeira.query('commit;');
    falha(await disputa,/dados diferentes/);const s=await a.estado();assert.deepEqual(saldos(s),[99000,20000]);assert.equal(s.total_centavos,119000);
    const n=await a.preservar();assert.equal(n.movimentos,1);assert.equal(n.recibos_movimento,1);
  });

  test('PG nativo: duas parciais concorrentes não excedem restante da obrigação',{timeout:25000},async t=>{
    const a=await ambiente(t),cp=await a.conta();await a.primeira.query('begin;');
    await a.primeira.json(a.rpc(a.pedido({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:7000})));
    const disputa=sucesso(a.segunda.json(a.rpc(a.pedido({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:4000}))));
    await a.esperarBloqueio();await a.primeira.query('commit;');falha(await disputa,/excede o restante/);
    const s=await a.estado();assert.deepEqual(saldos(s),[93000,20000]);assert.equal(s.total_centavos,113000);
    assert.deepEqual(s.pagamentos,[{conta_pagar_id:cp,pago_centavos:7000,restante_centavos:3000}]);
    assert.deepEqual(await a.obrigacao(cp),{status:'pendente',data_pagamento:null});
    const n=await a.preservar();assert.equal(n.movimentos,1);assert.equal(n.recibos_movimento,1);
  });

  test('PG nativo: duas parciais válidas serializam e quitam somente uma obrigação',{timeout:25000},async t=>{
    const a=await ambiente(t),cp=await a.conta();await a.primeira.query('begin;');
    await a.primeira.json(a.rpc(a.pedido({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:4000})));
    const disputa=sucesso(a.segunda.json(a.rpc(a.pedido({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:6000,data_efetiva:'2001-06-07'}))));
    await a.esperarBloqueio();await a.primeira.query('commit;');confirmar(await disputa);
    const s=await a.estado();assert.deepEqual(saldos(s),[90000,20000]);assert.equal(s.total_centavos,110000);
    assert.deepEqual(s.pagamentos,[{conta_pagar_id:cp,pago_centavos:10000,restante_centavos:0}]);
    assert.deepEqual(await a.obrigacao(cp),{status:'pago',data_pagamento:'2001-06-07'});
    const n=await a.preservar();assert.equal(n.movimentos,2);assert.equal(n.recibos_movimento,2);
  });

  test('PG nativo: cancelar transferência ainda não confirmada espera e neutraliza as duas contas',{timeout:25000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');
    const tr=await a.primeira.json(a.rpc(a.pedido({tipo:'transferencia',destino_id:a.contas[1].id,valor_centavos:3000})));
    const disputa=sucesso(a.segunda.json(a.rpc(a.cancelar(tr))));await a.esperarBloqueio();
    let s=await a.estado();assert.deepEqual(saldos(s),[100000,20000]);assert.equal(s.movimentos.length,0);
    await a.primeira.query('commit;');confirmar(await disputa);
    s=await a.estado();assert.deepEqual(saldos(s),[100000,20000]);assert.equal(s.total_centavos,120000);
    assert.equal(s.movimentos.length,1);assert.ok(s.movimentos[0].cancelado_em);assert.equal(s.movimentos[0].afeta_saldo,false);
    const n=await a.preservar();assert.equal(n.ativos,0);assert.equal(n.recibos_movimento,1);assert.equal(n.recibos_cancelamento,1);
  });

  test('PG nativo: rollback da transferência libera espera; cancelamento não fabrica movimento',{timeout:25000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');
    const tr=await a.primeira.json(a.rpc(a.pedido({tipo:'transferencia',destino_id:a.contas[1].id,valor_centavos:3000})));
    const disputa=sucesso(a.segunda.json(a.rpc(a.cancelar(tr))));await a.esperarBloqueio();await a.primeira.query('rollback;');
    falha(await disputa,/Movimento indisponivel/);
    const s=await a.estado();assert.deepEqual(saldos(s),[100000,20000]);assert.equal(s.total_centavos,120000);
    const n=await a.preservar();assert.equal(n.movimentos,0);assert.equal(n.recibos_movimento,0);assert.equal(n.recibos_cancelamento,0);
  });

  test('PG nativo: mesmo cancelamento simultâneo retorna recibo único sem neutralização dupla',{timeout:25000},async t=>{
    const a=await ambiente(t);const tr=await a.primeira.json(a.rpc(a.pedido({tipo:'transferencia',destino_id:a.contas[1].id,valor_centavos:3000})));
    const p=a.cancelar(tr),uuid=randomUUID();assert.deepEqual(saldos(await a.estado()),[97000,23000]);
    await a.primeira.query('begin;');const r=await a.primeira.json(a.rpc(p,uuid));
    const disputa=sucesso(a.segunda.json(a.rpc(p,uuid)));await a.esperarBloqueio();await a.primeira.query('commit;');
    assert.deepEqual(confirmar(await disputa),r);const s=await a.estado();assert.deepEqual(saldos(s),[100000,20000]);assert.equal(s.total_centavos,120000);
    const n=await a.preservar();assert.equal(n.movimentos,1);assert.equal(n.ativos,0);assert.equal(n.recibos_cancelamento,1);
  });

  test('PG nativo: rollback aguarda registro concorrente e recusa DROP após commit da abertura',{timeout:25000},async t=>{
    const a=await ambiente(t,false);await a.primeira.query('begin;');await a.primeira.json(a.rpc(a.abertura));
    // Rollback pertence ao owner somente no cluster descartavel. A terceira
    // conexao observa o lock real sem consultar dados de qualquer banco externo.
    await a.segunda.query('reset role;');const disputa=sucesso(a.segunda.query(rollback));
    await a.esperarBloqueio();assert.deepEqual((await a.estado()).contas,[]);
    await a.primeira.query('commit;');falha(await disputa,/Rollback bloqueado/);
    const s=await a.estado();assert.deepEqual(saldos(s),[100000,20000]);assert.equal(s.total_centavos,120000);
    assert.equal(await a.obs.json('select to_json(count(*)) from caixa_operacoes;'),1);
    const n=await a.preservar();assert.equal(n.movimentos,0);assert.equal(n.recibos_movimento,0);assert.equal(n.recibos_cancelamento,0);
  });
}
