const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
if(!process.env.EDR_POSTGRES_BIN){
  test('concorrencia PostgreSQL nativo',{skip:'Defina EDR_POSTGRES_BIN; nao houve teste com conexoes simultaneas.'},()=>{});
}else{
  const {iniciar}=require('./fixtures/estoque-pg-local.cjs');
  const fixture=fs.readFileSync(path.join(__dirname,'fixtures/estoque-transacao-base.sql'),'utf8').replace('create role anon; create role authenticated;','');
  const migration = require('./fixtures/custo-nota.cjs').sql + fs.readFileSync(path.join(__dirname,'../sql/estoque-saida-atomica-DRAFT.sql'),'utf8').split('-- BEGIN ESTOQUE TX BODY')[1].split('-- END ESTOQUE TX BODY')[0];
  const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
  const empresa=id(1),admin=id(3),material=id(6),obra=id(7),nf=id(8);
  const literal=v=>v==null?'null':"'"+String(v).replace(/'/g,"''")+"'";
  let pg,controle,seq=0;
  test.before(async()=>{
    pg=await iniciar();console.log('NATIVO '+pg.versao+'; somente 127.0.0.1; '+pg.pasta);
    controle=pg.conectar();await controle.query('create role anon;create role authenticated;');
  });
  test.after(async()=>{if(pg)await pg.parar()});
  async function ambiente(t){
    const banco='edr_estoque_t'+(++seq);await controle.query('create database '+banco+';');
    const obs=pg.conectar(banco,banco+'_obs');
    const sessoes=[obs];t.after(async()=>{for(const s of sessoes){if(s.pendente)s.destruir();else await s.fechar()}});
    await obs.query(fixture+'\n'+migration);
    await obs.query(`insert into companies values('${empresa}');
      insert into company_users values('${admin}','${empresa}','admin');
      insert into materiais(id,company_id,codigo,nome,unidade) values('${material}','${empresa}','000001','MATERIAL','UN');
      insert into obras(id,company_id,nome) values('${obra}','${empresa}','OBRA');
      insert into estoque_transacao_config values('${empresa}',true);
      insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,itens)
      values('${nf}','${empresa}',current_date-1,clock_timestamp()-interval '1 day','FORNECEDOR','12345678000100','EDR',
        '[{"codigo":"000001","desc":"MATERIAL","qtd":10,"preco":10,"total":100}]');`);

    // ACL/RLS minimas de ensaio para os caminhos legados; nao reproduzem toda a politica de producao.
    await obs.query("grant usage on schema auth to authenticated;");
    for(const tabela of ['notas_fiscais','ajustes_estoque','materiais','lancamentos','entradas_diretas','distribuicoes']){
      await obs.query('grant select,insert,update,delete on public.'+tabela+' to authenticated; alter table public.'+tabela+' enable row level security; '
        +'create policy ensaio_empresa on public.'+tabela+' for all to authenticated using(company_id=auth_company_id()) with check(company_id=auth_company_id());');
    }

    async function sessao(nome){const s=pg.conectar(banco,banco+'_'+nome);sessoes.push(s);await s.query(`select set_config('request.jwt.claim.sub','${admin}',false);set role authenticated;`);return s}
    const primeira=await sessao('primeira'),segunda=await sessao('segunda');
    const pid1=await primeira.json('select to_json(pg_backend_pid());'),pid2=await segunda.json('select to_json(pg_backend_pid());');
    async function pedido(qtd,extra={}){return{uuid:randomUUID(),qtd,momento:await obs.json('select to_json(clock_timestamp());'),...extra}}
    const rpc=p=>`select registrar_saida_estoque_atomica('${p.uuid}','${material}','${obra}',${p.qtd},${literal(p.momento)},'04_alven','fifo','nao_classificado',null,'ENSAIO CONCORRENTE',${p.semOrigem||0},null);`;
    const totais=()=>obs.json(`select json_build_object('custos',(select count(*) from lancamentos),'saidas',(select count(*) from distribuicoes),
      'origens',(select count(*) from estoque_saida_origens),'operacoes',(select count(*) from estoque_operacoes),'custo',(select coalesce(sum(total),0) from lancamentos));`);
    const saldo=()=>obs.json(`select to_json((_estoque_tx_lotes(m,clock_timestamp())->>'saldo')::numeric) from materiais m where id='${material}';`);
    async function esperarBloqueio(pid,bloqueador){
      const fim=Date.now()+5000;
      do{
        const r=await obs.json(`select json_build_object('pid',pid,'espera',wait_event_type,'bloqueadores',pg_blocking_pids(pid)) from pg_stat_activity where pid=${pid};`);
        if(r?.espera==='Lock'&&r.bloqueadores.includes(bloqueador)){t.diagnostic('Espera real: PID '+pid+' bloqueado por '+bloqueador);return r}
        await new Promise(r=>setTimeout(r,25));
      }while(Date.now()<fim);
      throw Error('Nao observou bloqueio real entre conexoes');
    }
    const devolucao=qtd=>`insert into notas_fiscais(company_id,data,criado_em,fornecedor,cnpj,natureza,obra,itens,nota_origem_id,motivo_devolucao)
      values('${empresa}',current_date,clock_timestamp(),'FORNECEDOR','12345678000100','DEVOLUCAO','EDR',
      '[{"codigo":"000001","desc":"MATERIAL","qtd":${qtd},"preco":10,"total":${qtd*10},"item_idx_origem":0}]','${nf}','ENSAIO');`;
    const contagem=real=>`insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em)
      values('${empresa}','MATERIAL','000001',0,'contagem','real ${real}',clock_timestamp());`;
    return{obs,primeira,segunda,pid1,pid2,sessao,pedido,rpc,totais,saldo,esperarBloqueio,devolucao,contagem};
  }
  const resultado=p=>p.then(valor=>({ok:true,valor}),erro=>({ok:false,erro}));
  const falha=(r,regex)=>{assert.equal(r.ok,false);assert.match(r.erro.message,regex)};
  test('PG real: duas saidas concorrentes nao consomem o mesmo saldo',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');const p=await a.pedido(7);await a.primeira.json(a.rpc(p));
    const disputa=resultado(a.segunda.json(a.rpc(await a.pedido(4))));await a.esperarBloqueio(a.pid2,a.pid1);
    await a.primeira.query('commit;');falha(await disputa,/saldo insuficiente/);
    assert.equal(await a.saldo(),3);assert.deepEqual(await a.totais(),{custos:1,saidas:1,origens:1,operacoes:1,custo:70});
  });
  test('PG real: repeticao simultanea do mesmo pedido devolve a mesma saida',{timeout:20000},async t=>{
    const a=await ambiente(t),p=await a.pedido(7);await a.primeira.query('begin;');const r=await a.primeira.json(a.rpc(p));
    const disputa=resultado(a.segunda.json(a.rpc(p)));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    const s=await disputa;assert.equal(s.ok,true,s.erro?.message);assert.equal(s.valor.distribuicao_id,r.distribuicao_id);assert.equal(s.valor.repetida,true);
    assert.equal((await a.totais()).saidas,1);
  });
  test('PG real: duas saidas validas serializam e encerram saldo zero',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');await a.primeira.json(a.rpc(await a.pedido(7)));
    const disputa=resultado(a.segunda.json(a.rpc(await a.pedido(3))));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    const r=await disputa;assert.equal(r.ok,true,r.erro?.message);assert.equal(await a.saldo(),0);assert.equal((await a.totais()).custo,100);
  });
  test('PG real: devolucao aguarda saida e rejeita a origem consumida',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');await a.primeira.json(a.rpc(await a.pedido(7)));
    const disputa=resultado(a.segunda.query(a.devolucao(1)));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    falha(await disputa,/compra ja usada/);assert.equal(await a.saldo(),3);
    assert.equal(await a.obs.json("select to_json(count(*)) from notas_fiscais where natureza='DEVOLUCAO';"),0);
  });
  test('PG real: saida espera devolucao e le o saldo atualizado',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;'+a.devolucao(4));
    const disputa=resultado(a.segunda.json(a.rpc(await a.pedido(8))));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    falha(await disputa,/saldo insuficiente/);assert.equal(await a.saldo(),6);assert.equal((await a.totais()).saidas,0);
  });
  test('PG real: saida espera contagem zero e nao usa lote antigo',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;'+a.contagem(0));
    const disputa=resultado(a.segunda.json(a.rpc(await a.pedido(1))));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    falha(await disputa,/saldo insuficiente/);assert.equal(await a.saldo(),0);assert.equal((await a.totais()).custos,0);
  });
  test('PG real: contagem posterior espera a saida e conserva o corte',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');await a.primeira.json(a.rpc(await a.pedido(7)));
    const disputa=resultado(a.segunda.query(a.contagem(0)));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    const r=await disputa;assert.equal(r.ok,true,r.erro?.message);assert.equal(await a.saldo(),0);assert.equal((await a.totais()).saidas,1);
  });
  test('PG real: rollback da primeira saida libera saldo para a segunda',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.primeira.query('begin;');await a.primeira.json(a.rpc(await a.pedido(7)));
    const disputa=resultado(a.segunda.json(a.rpc(await a.pedido(8))));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('rollback;');
    const r=await disputa;assert.equal(r.ok,true,r.erro?.message);assert.equal(await a.saldo(),2);
    assert.deepEqual(await a.totais(),{custos:1,saidas:1,origens:1,operacoes:1,custo:80});
  });
  test('PG real: confirmacao descartada apos commit permite repetir em nova conexao',{timeout:20000},async t=>{
    const a=await ambiente(t),p=await a.pedido(7);
    // A aplicacao descarta a resposta. Outra conexao confirma persistencia antes de cortar o cliente.
    const descartada=resultado(a.primeira.query('begin;'+a.rpc(p)+'commit;'));
    let total;for(let i=0;i<100;i++){total=await a.totais();if(total.operacoes===1)break;await new Promise(r=>setTimeout(r,10))}
    assert.equal(total.operacoes,1);a.primeira.destruir();await descartada;
    const r=await a.segunda.json(a.rpc(p));assert.equal(r.repetida,true);assert.equal((await a.totais()).saidas,1);assert.equal(await a.saldo(),3);
  });
  test('PG real: deadlock aborta uma transacao e repeticao preserva integridade',{timeout:20000},async t=>{
    const a=await ambiente(t);await a.segunda.query(`begin;select id from materiais where id='${material}' for update;`);
    const p=await a.pedido(2),um=resultado(a.primeira.json(a.rpc(p)));
    await a.esperarBloqueio(a.pid1,a.pid2);
    const dois=resultado(a.segunda.query(a.contagem(10)).then(async x=>{await a.segunda.query('commit;');return x}));
    const resultados=await Promise.all([um,dois]);
    assert.ok(resultados.some(r=>!r.ok&&/40P01/.test(r.erro.message)),resultados.map(r=>r.erro?.message).join());
    const total=await a.totais();const nova=await a.sessao('retry');
    const repetir=total.operacoes===1?p:{...p,momento:await a.obs.json('select to_json(clock_timestamp());')};
    const r=await nova.json(a.rpc(repetir));assert.equal(r.qtd,2);assert.equal((await a.totais()).saidas,1);assert.equal(await a.saldo(),8);
    t.diagnostic('SQLSTATE 40P01 observado; transacao abortada sem custo/origem orfa e repeticao validada.');
  });
  async function prepararRegularizacao(a){
    const r=await a.primeira.json(a.rpc(await a.pedido(13,{semOrigem:3})));
    const pendencia=await a.obs.json(`select to_json(id) from estoque_saida_origens where tipo='sem_origem' and distribuicao_id='${r.distribuicao_id}';`);
    const origem=randomUUID();await a.primeira.query(`insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,itens)
      values('${origem}','${empresa}',current_date-1,clock_timestamp()-interval '1 day','REC. OMITIDO','12345678000100','EDR',
      '[{"codigo":"000001","desc":"MATERIAL","qtd":3,"preco":20,"total":60,"unidade":"UN"}]');`);
    const proposta=await a.primeira.json(`select propor_regularizacao_estoque('${pendencia}','nf','${origem}',0,3);`);
    const operacao=randomUUID();
    const aplicar=(op=operacao)=>`select regularizar_origem_estoque('${op}','${pendencia}','nf','${origem}',0,3,'${proposta.revisao}',
      'Canhoto do recebimento comprovado','Recebimento anterior conferido pelo administrador','manter_custo_registrado');`;
    return{aplicar,pendencia};
  }
  test('PG real REG: repeticao simultanea regulariza uma vez com os mesmos IDs',{timeout:20000},async t=>{
    const a=await ambiente(t),p=await prepararRegularizacao(a);await a.primeira.query('begin;');const r=await a.primeira.json(p.aplicar());
    const disputa=resultado(a.segunda.json(p.aplicar()));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    const s=await disputa;assert.equal(s.ok,true,s.erro?.message);assert.equal(s.valor.origem_id,r.origem_id);assert.equal(s.valor.repetida,true);
    assert.equal(await a.saldo(),0);assert.equal(await a.obs.json('select to_json(count(*)) from estoque_regularizacoes;'),1);
  });
  test('PG real REG: pedidos distintos nao regularizam a mesma pendencia duas vezes',{timeout:20000},async t=>{
    const a=await ambiente(t),p=await prepararRegularizacao(a);await a.primeira.query('begin;');await a.primeira.json(p.aplicar());
    const disputa=resultado(a.segunda.json(p.aplicar(randomUUID())));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    falha(await disputa,/pendencia inexistente/);assert.equal(await a.obs.json('select to_json(count(*)) from estoque_regularizacoes;'),1);
    assert.equal((await a.totais()).custo,130);assert.equal(await a.saldo(),0);
  });

  test('PG real NF: duas conexoes repetem pedido sem duplicar NF/custo/baixa',{timeout:20000},async t=>{
    const a=await ambiente(t);
    await a.obs.query('create table contas_pagar(id uuid default gen_random_uuid(),company_id uuid,fornecedor text,descricao text,valor numeric,data_vencimento date,status text,data_pagamento date,tipo text,nota_id uuid,nota_ref text); grant select on obras to authenticated; grant select,insert on contas_pagar to authenticated;');
    const hoje=await a.obs.json('select to_json(current_date);');
    const nota={data:hoje,data_recebimento:hoje,data_efetiva_estoque:hoje,natureza:'VENDA',numero_nf:'100',fornecedor:'TESTE',cnpj:'12345678000100',obra:'OBRA',valor_bruto:360,desconto_total:40,
      chave_acesso:'0'.repeat(20)+'55'+'0'.repeat(22),itens:JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:10,total:400,preco:40}])};
    const pedido=`select registrar_nota_fiscal_atomica('${randomUUID()}',${literal(JSON.stringify(nota))}::jsonb,'[{"etapa":"04_alven","movimenta_estoque":true}]'::jsonb,'{}'::jsonb);`;
    await a.primeira.query('begin;');const primeiro=await a.primeira.json(pedido);
    const disputa=resultado(a.segunda.json(pedido));await a.esperarBloqueio(a.pid2,a.pid1);await a.primeira.query('commit;');
    const segundo=await disputa;assert.equal(segundo.ok,true,segundo.erro?.message);assert.equal(segundo.valor.repetida,true);assert.equal(primeiro.nota.id,segundo.valor.nota.id);
    assert.equal(await a.obs.json('select to_json(count(*)) from notas_operacoes;'),1);
    assert.equal((await a.totais()).custos,1);assert.equal((await a.totais()).saidas,1);assert.equal((await a.totais()).custo,360);
  });

}
