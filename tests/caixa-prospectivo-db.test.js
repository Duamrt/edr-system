'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Runtime apenas de teste. Falta dele e reportada como SKIP, nunca aprovacao SQL.
// EDR_PGLITE_PATH=<pasta instalada de @electric-sql/pglite> node --test tests/caixa-prospectivo-db.test.js
if (!process.env.EDR_PGLITE_PATH) {
  test('caixa prospectivo: PostgreSQL sintético', {skip:'Defina EDR_PGLITE_PATH; SQL nao foi executado.'}, () => {});
} else {
  const { PGlite } = require(process.env.EDR_PGLITE_PATH);
  const fixture = fs.readFileSync(path.join(__dirname,'fixtures/caixa-prospectivo-base.sql'),'utf8');
  const migration = fs.readFileSync(path.join(__dirname,'../sql/caixa-prospectivo-DRAFT.sql'),'utf8');
  const rollback = fs.readFileSync(path.join(__dirname,'../sql/caixa-prospectivo-rollback-DRAFT.sql'),'utf8');
  const id = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const company=id(1), other=id(2), admin=id(3), operational=id(4), reader=id(5), otherAdmin=id(6);
  let sequence=100;

  async function ambiente(t, abrir=true) {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(fixture); await db.exec(migration);
    await db.query('insert into companies(id) values($1),($2)',[company,other]);
    await db.query("insert into company_users(user_id,company_id,role) values($1,$2,'admin'),($3,$2,'operacional'),($4,$2,'leitura'),($5,$6,'admin')",[admin,company,operational,reader,otherAdmin,other]);
    const sessao=async user => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
      await db.exec('set role authenticated');
    };
    await sessao(admin);
    const enviar=async (pedido, op=id(sequence++)) => (await db.query('select public.caixa_registrar($1,$2::jsonb) r',[op,JSON.stringify(pedido)])).rows[0].r;
    const estado=async () => (await db.query('select public.caixa_estado() r')).rows[0].r;
    const abertura=() => ({action:'abertura',corte_local:'2001-06-05T18:23',fuso:'America/Sao_Paulo',
      contas:[{codigo:'banco',nome:'Banco QA',saldo_centavos:100000},{codigo:'dinheiro',nome:'Dinheiro QA',saldo_centavos:20000}]});
    if(abrir) await enviar(abertura());
    const movimento=async (extra={},op) => {
      const s=await estado();
      return enviar({action:'movimento',tipo:'saida',conta_id:s.contas.find(c=>c.codigo==='banco').id,
        destino_id:null,valor_centavos:1000,data_efetiva:'2001-06-06',hora_efetiva:null,
        decisao_corte:null,descricao:'Movimento sintético QA',conta_pagar_id:null,...extra},op);
    };
    const conta=async (valor=100,status='pendente',tipo='despesa',empresa=company) => {
      const cp=id(sequence++);await db.exec('reset role');
      await db.query('insert into contas_pagar(id,company_id,valor,status,tipo,data_vencimento,descricao) values($1,$2,$3,$4,$5,$6,$7)',[cp,empresa,valor,status,tipo,'2000-12-01','Obrigação QA antiga']);
      await db.exec('set role authenticated');return cp;
    };
    const owner=async sql => {await db.exec('reset role');try{return await db.query(sql);}finally{await db.exec('set role authenticated');}};
    const original=async () => (await owner("select (select saldo_manual::float8 from companies where id='"+company+"') saldo_manual,(select count(*)::int from lancamentos) custos,(select total::float8 from lancamentos where id=1) custo,(select status from diarias_quinzenas where id=1) folha,(select qtd::int from distribuicoes where id=1) estoque")).rows[0];
    return {db,enviar,estado,abertura,movimento,conta,sessao,owner,original};
  }
  const cancelamento = m => ({action:'cancelar',movimento_id:m.movimento_id,motivo:'Correção sintética QA'});
  const total = async a => (await a.estado()).total_centavos;

  test('abertura separada, imutável e idempotente preserva saldo manual/custos/folha/estoque',async t => {
    const a=await ambiente(t,false);const inicial=await a.original();const op=id(sequence++);const p=a.abertura();
    const s0=await a.estado();assert.deepEqual(s0.contas,[]);assert.equal(s0.total_centavos,0);
    const r=await a.enviar(p,op);assert.equal(r.company_id,company);assert.deepEqual(await a.enviar(p,op),r);
    assert.deepEqual((await a.estado()).contas.map(c=>[c.codigo,c.saldo_centavos]),[['banco',100000],['dinheiro',20000]]);
    assert.equal(await total(a),120000);assert.deepEqual((await a.estado()).movimentos,[]);
    await assert.rejects(a.enviar({...p,corte_local:'2001-06-05T18:24'},op),/dados diferentes/);
    await assert.rejects(a.enviar(p),/imutavel/);assert.deepEqual(await a.original(),inicial);
  });

  test('abertura inválida falha atomicamente sem gravar uma conta nem recibo',async t => {
    const a=await ambiente(t,false);const p=a.abertura();p.contas[1].codigo='banco';
    await assert.rejects(a.enviar(p),/duplicate key/);
    assert.deepEqual((await a.estado()).contas,[]);
    assert.equal((await a.owner('select count(*)::int n from caixa_operacoes')).rows[0].n,0);
    await assert.rejects(a.enviar({...a.abertura(),fuso:'Fuso/Inexistente'}),/Fuso/);
    await assert.rejects(a.enviar({...a.abertura(),corte_local:'2001-06-05T24:00'}),/Abertura invalida/);
    await assert.rejects(a.enviar({...a.abertura(),corte_local:'2001-06-05T18:60'}),/Abertura invalida/);
    await assert.rejects(a.enviar({...a.abertura(),contas:[a.abertura().contas[0]]}),/banco e dinheiro/);
    await a.enviar(a.abertura());assert.equal(await total(a),120000);
  });

  test('corte por data/hora efetiva: antes e exatamente marco já incluídos; depois soma uma vez',async t => {
    const a=await ambiente(t);
    await a.movimento({data_efetiva:'2001-06-04'});
    await a.movimento({data_efetiva:'2001-06-05',hora_efetiva:'18:22'});
    await a.movimento({data_efetiva:'2001-06-05',hora_efetiva:'18:23'});
    assert.equal(await total(a),120000);
    await a.movimento({data_efetiva:'2001-06-05',hora_efetiva:'18:24'});
    await a.movimento({tipo:'entrada',valor_centavos:2500});assert.equal(await total(a),121500);
    const m=(await a.estado()).movimentos;
    assert.equal(m.filter(v=>v.decisao_corte==='incluido_abertura').length,3);
    assert.ok(m.every(v=>String(v.criado_em).startsWith(String(new Date().getUTCFullYear()))));
  });

  test('mesmo dia sem hora exige decisão; contradição e efetivo futuro são rejeitados',async t => {
    const a=await ambiente(t);
    await assert.rejects(a.movimento({data_efetiva:'2001-06-05'}),/decisao explicita/);
    await a.movimento({data_efetiva:'2001-06-05',decisao_corte:'incluido_abertura'});
    await a.movimento({data_efetiva:'2001-06-05',decisao_corte:'apos_corte'});assert.equal(await total(a),119000);
    await assert.rejects(a.movimento({data_efetiva:'2001-06-04',decisao_corte:'apos_corte'}),/contradiz/);
    await assert.rejects(a.movimento({data_efetiva:'2001-06-06',decisao_corte:'incluido_abertura'}),/contradiz/);
    await assert.rejects(a.movimento({data_efetiva:'2999-01-01'}),/futuro/);
    await assert.rejects(a.movimento({hora_efetiva:'24:00'}),/Hora/);
    await assert.rejects(a.movimento({valor_centavos:1.2}),/inteiro/);
    await assert.rejects(a.movimento({valor_centavos:0}),/Valor/);
    await assert.rejects(a.movimento({valor_centavos:-1}),/inteiro/);
    assert.equal((await a.estado()).movimentos.length,2);
  });

  test('hora futura no dia atual é rejeitada e timezone declarado independe do timezone da sessão',async t => {
    const a=await ambiente(t);await a.owner("set timezone='Pacific/Auckland'");
    await a.movimento({data_efetiva:'2001-06-05',hora_efetiva:'18:23'});assert.equal(await total(a),120000);
    await a.movimento({data_efetiva:'2001-06-05',hora_efetiva:'18:24'});assert.equal(await total(a),119000);
    const futuro=(await a.db.query("select to_char((now()+interval '2 hours') at time zone 'America/Sao_Paulo','YYYY-MM-DD') dia,to_char((now()+interval '2 hours') at time zone 'America/Sao_Paulo','HH24:MI') hora")).rows[0];
    await assert.rejects(a.movimento({data_efetiva:futuro.dia,hora_efetiva:futuro.hora}),/futuro/);
    const b=await ambiente(t,false);await assert.rejects(b.enviar({...b.abertura(),corte_local:'2999-01-01T12:00'}),/futuro/);
    assert.equal((await b.estado()).contas.length,0);
  });

  test('centavos por conta e total permanecem exatos para Number; excesso reverte a operação',async t => {
    const a=await ambiente(t,false);const p=a.abertura();p.contas[0].saldo_centavos=Number.MAX_SAFE_INTEGER;p.contas[1].saldo_centavos=2;
    await assert.rejects(a.enviar(p),/faixa segura/);assert.equal((await a.estado()).contas.length,0);
    p.contas[1].saldo_centavos=0;await a.enviar(p);assert.equal(await total(a),Number.MAX_SAFE_INTEGER);
    await assert.rejects(a.movimento({tipo:'entrada',valor_centavos:1}),/faixa segura/);
    assert.equal((await a.estado()).movimentos.length,0);assert.equal(await total(a),Number.MAX_SAFE_INTEGER);
    const tr=await a.movimento({tipo:'transferencia',destino_id:(await a.estado()).contas[1].id,valor_centavos:2});
    assert.equal(await total(a),Number.MAX_SAFE_INTEGER);await a.enviar(cancelamento(tr));assert.equal(await total(a),Number.MAX_SAFE_INTEGER);
  });

  test('transferência vinculada tem total zero; tarifa separada e cancelamento auditado',async t => {
    const a=await ambiente(t);const contas=(await a.estado()).contas;const dinheiro=contas.find(c=>c.codigo==='dinheiro');
    const tr=await a.movimento({tipo:'transferencia',destino_id:dinheiro.id,valor_centavos:3000});
    const s=await a.estado();assert.equal(s.total_centavos,120000);
    assert.deepEqual(s.contas.map(c=>c.saldo_centavos),[97000,23000]);assert.equal(s.movimentos.length,1);
    await a.movimento({valor_centavos:350,descricao:'Tarifa sintética'});assert.equal(await total(a),119650);
    const op=id(sequence++);const r=await a.enviar(cancelamento(tr),op);assert.deepEqual(await a.enviar(cancelamento(tr),op),r);
    assert.deepEqual((await a.estado()).contas.map(c=>c.saldo_centavos),[99650,20000]);
    const m=(await a.estado()).movimentos.find(m=>m.id===tr.movimento_id);assert.ok(m.cancelado_em);assert.equal(m.afeta_saldo,false);
    assert.equal(m.motivo_cancelamento,'Correção sintética QA');
    await assert.rejects(a.enviar(cancelamento(tr)),/ja cancelado/);
    await assert.rejects(a.movimento({tipo:'transferencia',destino_id:contas[0].id}),/Destino/);
  });

  test('entrada e saída explícitas: clique duplo/reenvio usa recibo durável e payload divergente falha',async t => {
    const a=await ambiente(t);const conta=(await a.estado()).contas[0].id;const op=id(sequence++);
    const p={action:'movimento',tipo:'entrada',conta_id:conta,destino_id:null,valor_centavos:4000,data_efetiva:'2001-06-06',hora_efetiva:null,decisao_corte:null,descricao:'Entrada QA',conta_pagar_id:null};
    const [r1,r2]=await Promise.all([a.enviar(p,op),a.enviar(p,op)]);assert.equal(r1.company_id,company);assert.deepEqual(r1,r2);assert.equal(await total(a),124000);
    await assert.rejects(a.enviar({...p,valor_centavos:5000},op),/dados diferentes/);
    await a.movimento();assert.equal(await total(a),123000);assert.equal((await a.estado()).movimentos.length,2);
  });

  test('obrigação antiga paga depois do corte: parcial, conclusão, limites e cancelamento sem duplicar custo',async t => {
    const a=await ambiente(t);const original=await a.original();const cp=await a.conta(100,'vencido');
    const p1=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:4000});
    assert.equal(await total(a),116000);assert.deepEqual((await a.estado()).pagamentos.find(p=>p.conta_pagar_id===cp),{conta_pagar_id:cp,pago_centavos:4000,restante_centavos:6000});
    assert.equal((await a.owner('select status from contas_pagar')).rows[0].status,'vencido');
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:6001}),/excede/);
    const p2=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:6000,data_efetiva:'2001-06-07'});
    assert.equal(await total(a),110000);let cpRow=(await a.owner('select status,data_pagamento::text from contas_pagar')).rows[0];
    assert.deepEqual(cpRow,{status:'pago',data_pagamento:'2001-06-07'});
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:1}),/excede/);
    await a.enviar(cancelamento(p2));assert.equal(await total(a),116000);
    cpRow=(await a.owner('select status,data_pagamento::text from contas_pagar')).rows[0];assert.deepEqual(cpRow,{status:'vencido',data_pagamento:null});
    await a.enviar(cancelamento(p1));assert.equal(await total(a),120000);
    assert.equal((await a.estado()).pagamentos.find(p=>p.conta_pagar_id===cp).restante_centavos,10000);
    assert.deepEqual(await a.original(),original);
  });

  test('fechar pagamento já incluído na abertura quita obrigação sem debitar novamente; pago legado é bloqueado',async t => {
    const a=await ambiente(t);const original=await a.original();const cp=await a.conta(70);
    await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:7000,data_efetiva:'2001-06-04'});
    assert.equal(await total(a),120000);assert.equal((await a.owner("select status from contas_pagar where id='"+cp+"'")).rows[0].status,'pago');
    const pago=await a.conta(80,'pago');await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:pago}),/ja paga no legado/);
    const cancelada=await a.conta(90,'cancelado');await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cancelada}),/cancelada/);
    const reembolso=await a.conta(95,'pendente','reembolso_fornecedor');await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:reembolso}),/Reembolso/);
    assert.equal((await a.estado()).movimentos.length,1);assert.deepEqual(await a.original(),original);
  });

  test('conta avulsa de obra exige confirmação auditada de custo sem criar lançamento',async t => {
    const a=await ambiente(t);const original=await a.original();const cp=await a.conta(100);
    await a.owner("update contas_pagar set obra_id='"+id(77)+"',nota_ref='  ' where id='"+cp+"'");
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000}),/Confirme o custo/);
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000,custo_confirmado:'true'}),/Confirme o custo/);
    const op=id(sequence++);await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000,custo_confirmado:true},op);
    assert.equal(await total(a),110000);assert.equal((await a.db.query('select pedido from caixa_operacoes where id=$1',[op])).rows[0].pedido.custo_confirmado,true);
    assert.deepEqual(await a.original(),original);
  });

  test('erro de persistência após inserir pagamento reverte movimento, snapshot, recibo e obrigação',async t => {
    const a=await ambiente(t);const cp=await a.conta(100);const op=id(sequence++);
    await a.owner("create function falha_pagamento_qa() returns trigger language plpgsql as $$begin raise exception 'FALHA QA PERSISTENCIA'; end$$");
    await a.owner('create trigger falha_qa before update on contas_pagar for each row execute function falha_pagamento_qa()');
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000},op),/FALHA QA/);
    assert.equal(await total(a),120000);assert.equal((await a.estado()).movimentos.length,0);
    assert.equal((await a.owner('select count(*)::int n from caixa_obrigacoes')).rows[0].n,0);
    assert.equal((await a.owner('select count(*)::int n from caixa_operacoes')).rows[0].n,1);
    await a.owner('drop trigger falha_qa on contas_pagar');
    await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000},op);assert.equal(await total(a),110000);
  });

  test('falha no recibo durável reverte transferência inteira e permite retry seguro',async t => {
    const a=await ambiente(t);const contas=(await a.estado()).contas;const op=id(sequence++);
    await a.owner("create function falha_recibo_qa() returns trigger language plpgsql as $$begin raise exception 'FALHA QA RECIBO'; end$$");
    await a.owner('create trigger falha_qa before insert on caixa_operacoes for each row execute function falha_recibo_qa()');
    await assert.rejects(a.movimento({tipo:'transferencia',destino_id:contas[1].id,valor_centavos:5000},op),/FALHA QA RECIBO/);
    assert.deepEqual((await a.estado()).contas.map(c=>c.saldo_centavos),[100000,20000]);assert.equal((await a.estado()).movimentos.length,0);
    await a.owner('drop trigger falha_qa on caixa_operacoes');
    await a.movimento({tipo:'transferencia',destino_id:contas[1].id,valor_centavos:5000},op);
    assert.deepEqual((await a.estado()).contas.map(c=>c.saldo_centavos),[95000,25000]);assert.equal(await total(a),120000);
  });

  test('cancelar recomputa data pelo pagamento ativo e restaura data original da obrigação',async t => {
    const a=await ambiente(t);const cp=await a.conta(100);
    await a.owner("update contas_pagar set data_pagamento='1999-05-01' where id='"+cp+"'");
    const p1=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:4000,data_efetiva:'2001-06-07'});
    const p2=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:6000,data_efetiva:'2001-06-06'});
    assert.equal((await a.owner('select data_pagamento::text from contas_pagar')).rows[0].data_pagamento,'2001-06-07');
    await a.enviar(cancelamento(p1));
    assert.equal((await a.owner('select data_pagamento::text from contas_pagar')).rows[0].data_pagamento,'1999-05-01');
    await a.enviar(cancelamento(p2));
    assert.deepEqual((await a.owner('select status,data_pagamento::text from contas_pagar')).rows[0],{status:'pendente',data_pagamento:'1999-05-01'});
    assert.equal(await total(a),120000);
  });

  test('cancelar pagamento em obrigação removida ou alterada aborta sem alterar auditoria/saldo',async t => {
    const a=await ambiente(t);const cp=await a.conta(100);const p=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:4000});
    await a.owner("update contas_pagar set valor=110 where id='"+cp+"'");
    await assert.rejects(a.enviar(cancelamento(p)),/alterada fora/);assert.equal(await total(a),116000);
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:1000}),/alterada fora/);
    await a.owner("delete from contas_pagar where id='"+cp+"'");
    await assert.rejects(a.enviar(cancelamento(p)),/removida/);
    assert.equal((await a.estado()).movimentos[0].cancelado_em,null);assert.equal(await total(a),116000);
  });

  test('cancelamento que falha ao atualizar obrigação mantém movimento ativo e saldo',async t => {
    const a=await ambiente(t);const cp=await a.conta(100);const p=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:10000});
    await a.owner("create function falha_cancelamento_qa() returns trigger language plpgsql as $$begin raise exception 'FALHA QA CANCELAMENTO'; end$$");
    await a.owner('create trigger falha_qa before update on contas_pagar for each row execute function falha_cancelamento_qa()');
    await assert.rejects(a.enviar(cancelamento(p)),/FALHA QA/);assert.equal(await total(a),110000);
    assert.equal((await a.estado()).movimentos[0].cancelado_em,null);
    assert.equal((await a.owner('select status from contas_pagar')).rows[0].status,'pago');
  });

  test('RLS e RPCs isolam empresa/perfil/sessão; escrita e TRUNCATE diretos são negados',async t => {
    const a=await ambiente(t);const cp=await a.conta(100);const contas=(await a.estado()).contas;const m=await a.movimento();
    for(const usuario of [operational,reader]){
      await a.sessao(usuario);assert.deepEqual((await a.db.query('select * from caixa_contas')).rows,[]);
      await assert.rejects(a.estado(),/Apenas administrador/);await assert.rejects(a.enviar(a.abertura()),/Apenas administrador/);
    }
    await a.sessao(otherAdmin);assert.deepEqual((await a.estado()).contas,[]);
    await a.enviar(a.abertura());
    await assert.rejects(a.movimento({conta_id:contas[0].id}),/indisponivel/);
    await assert.rejects(a.movimento({tipo:'pagamento',conta_pagar_id:cp}),/indisponivel/);
    await assert.rejects(a.enviar(cancelamento(m)),/indisponivel/);
    await a.sessao(admin);
    await assert.rejects(a.db.exec('delete from caixa_movimentos'),/permission denied/);
    await assert.rejects(a.db.exec('update caixa_contas set abertura_centavos=0'),/permission denied/);
    await assert.rejects(a.db.exec('truncate caixa_operacoes'),/permission denied/);
    await assert.rejects(a.db.exec("insert into caixa_obrigacoes(company_id,conta_pagar_id,valor_centavos,usuario_id) values('"+company+"','"+cp+"',1,'"+admin+"')"),/permission denied/);
    for(const tabela of ['caixa_contas','caixa_movimentos','caixa_operacoes']) await assert.rejects(a.db.exec('insert into '+tabela+' default values'),/permission denied/);
    await a.sessao(null);await assert.rejects(a.estado(),/Sessao/);await assert.rejects(a.enviar(a.abertura()),/Sessao/);
    await a.db.exec('reset role; set role anon');await assert.rejects(a.estado(),/permission denied/);
    await a.db.exec('reset role; set role anon');await assert.rejects(a.enviar(a.abertura()),/permission denied/);
  });

  test('administrador desativado com sessão válida perde SELECT/read/write/retry; reativação preserva tenant e recibo',async t => {
    const a=await ambiente(t);const cp=await a.conta(100),op=id(sequence++);
    const r=await a.movimento({tipo:'pagamento',conta_pagar_id:cp,valor_centavos:1000},op);
    const pedido=(await a.db.query('select pedido from caixa_operacoes where id=$1',[op])).rows[0].pedido;
    const anterior=await a.estado();const original=await a.original();
    for(const tabela of ['caixa_contas','caixa_movimentos','caixa_operacoes','caixa_obrigacoes']) assert.ok((await a.db.query('select * from '+tabela)).rows.length>0);
    for(const ativo of ['false','null']){
      await a.owner("update company_users set active="+ativo+" where user_id='"+admin+"'");
      // Mesmo UID e helpers legados ainda dizem admin/company: prova do guard novo.
      assert.deepEqual((await a.db.query('select auth.uid() usuario,auth_company_id() empresa,auth_user_role() papel')).rows[0],{usuario:admin,empresa:company,papel:'admin'});
      for(const tabela of ['caixa_contas','caixa_movimentos','caixa_operacoes','caixa_obrigacoes']) assert.deepEqual((await a.db.query('select * from '+tabela)).rows,[]);
      await assert.rejects(a.estado(),/administrador ativo/);
      await assert.rejects(a.enviar({...pedido,descricao:'Tentativa QA desativada'}),/administrador ativo/);
      await assert.rejects(a.enviar(pedido,op),/administrador ativo/);
      await assert.rejects(a.enviar(cancelamento(r)),/administrador ativo/);
      await assert.rejects(a.enviar(a.abertura()),/administrador ativo/);
    }
    await a.owner("update company_users set active=true where user_id='"+admin+"'");
    assert.deepEqual(await a.enviar(pedido,op),r);assert.deepEqual(await a.estado(),anterior);
    for(const tabela of ['caixa_contas','caixa_movimentos','caixa_operacoes','caixa_obrigacoes']) assert.ok((await a.db.query('select * from '+tabela)).rows.length>0);
    await a.movimento({tipo:'entrada',valor_centavos:250});assert.equal(await total(a),119250);
    assert.deepEqual(await a.original(),original);
    await a.sessao(otherAdmin);assert.deepEqual((await a.estado()).contas,[]);
    for(const tabela of ['caixa_contas','caixa_movimentos','caixa_operacoes','caixa_obrigacoes']) assert.deepEqual((await a.db.query('select * from '+tabela)).rows,[]);
  });

  test('preflight rejeita company_users sem active boolean antes de criar objetos de caixa',async t => {
    for(const preparo of ['alter table company_users drop column active',
      'alter table company_users alter column active drop default; alter table company_users alter column active type text using active::text']){
      const db=new PGlite();try{
        await db.exec(fixture);await db.exec(preparo);
        await assert.rejects(db.exec(migration),/Pre-requisito: company_users/);await db.exec('rollback');
        assert.equal((await db.query("select to_regclass('public.caixa_contas') tabela")).rows[0].tabela,null);
      }finally{await db.close();}
    }
  });

  test('rollback só remove schema vazio; abertura/recibos e movimentos bloqueiam qualquer DROP',async t => {
    const a=await ambiente(t,false);const original=await a.original();await a.db.exec('reset role');await a.db.exec(rollback);
    assert.equal((await a.db.query("select to_regclass('public.caixa_contas') as tabela")).rows[0].tabela,null);
    assert.deepEqual(await a.original(),original);
    const b=await ambiente(t);await b.db.exec('reset role');
    await assert.rejects(b.db.exec(rollback),/Rollback bloqueado/);await b.db.exec('rollback');await b.db.exec('set role authenticated');
    assert.equal(await total(b),120000);assert.equal((await b.estado()).contas.length,2);
    assert.equal((await b.owner('select count(*)::int n from caixa_operacoes')).rows[0].n,1);
    const c=await ambiente(t);await c.movimento();await c.db.exec('reset role');
    await assert.rejects(c.db.exec(rollback),/Rollback bloqueado/);await c.db.exec('rollback');await c.db.exec('set role authenticated');
    assert.equal(await total(c),119000);assert.equal((await c.estado()).movimentos.length,1);
  });
}
