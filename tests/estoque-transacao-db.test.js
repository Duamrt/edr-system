const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Dependencia APENAS do ensaio local. Nao e carregada pela aplicacao.
// Ex.: EDR_PGLITE_PATH=<pasta de @electric-sql/pglite> node --test <este arquivo>
if (!process.env.EDR_PGLITE_PATH) {
  test('ensaio SQL de estoque', { skip: 'Defina EDR_PGLITE_PATH para executar PostgreSQL em memoria; nao houve teste SQL.' }, () => {});
} else {
  const { PGlite } = require(process.env.EDR_PGLITE_PATH);
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/estoque-transacao-base.sql'), 'utf8');
  const draft = fs.readFileSync(path.join(__dirname, '../sql/estoque-saida-atomica-DRAFT.sql'), 'utf8');
  const migration = require('./fixtures/custo-nota.cjs').sql + draft.split('-- BEGIN ESTOQUE TX BODY')[1].split('-- END ESTOQUE TX BODY')[0];
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const company = id(1), other = id(2), admin = id(3), operational = id(4), reader = id(5), material = id(6), obra = id(7);
  let seq = 100;

  async function ambiente(t, habilitado = true) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(fixture);
    await db.exec(migration);
    await db.query('insert into companies values($1),($2)', [company, other]);
    await db.query("insert into company_users values($1,$2,'admin'),($3,$2,'operacional'),($4,$2,'leitura')", [admin, company, operational, reader]);
    await db.query('select set_config($1,$2,false)', ['request.jwt.claim.sub', admin]);
    await db.query("insert into materiais(id,company_id,codigo,nome,unidade) values($1,$2,'000001','MATERIAL','UN')", [material, company]);
    await db.query("insert into obras(id,company_id,nome) values($1,$2,'OBRA')", [obra, company]);
    await db.query('insert into estoque_transacao_config(company_id,habilitado) values($1,$2)', [company, habilitado]);

    async function nf(qtd, preco, indice = 0) {
      const nfId = id(seq++);
      const itens = Array.from({length: indice}, () => ({codigo:'999999',desc:'OUTRO',qtd:1,preco:1,total:1}));
      itens.push({codigo:'000001',desc:'MATERIAL',qtd,preco,total:qtd*preco});
      await db.query("insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,itens) values($1,$2,current_date-2,clock_timestamp()-interval '2 days','FORNECEDOR','12345678000100','EDR',$3)", [nfId,company,JSON.stringify(itens)]);
      return nfId;
    }
    async function pedido(qtd, extra = {}) {
      const time = (await db.query('select clock_timestamp() as t')).rows[0].t;
      return {operacao:id(seq++),material,obra,qtd,time,etapa:'04_alven',criterio:'fifo',destino:'nao_classificado',adicional:null,obs:'TESTE',...extra};
    }
    async function enviar(p) {
      return (await db.query('select public.registrar_saida_estoque_atomica($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as r',
        [p.operacao,p.material,p.obra,p.qtd,p.time,p.etapa,p.criterio,p.destino,p.adicional,p.obs,p.semOrigem??0,p.precoManual??null])).rows[0].r;
    }
    async function totais() {
      return (await db.query("select (select count(*)::int from lancamentos) custos,(select count(*)::int from distribuicoes) saidas,(select count(*)::int from estoque_saida_origens) origens,(select count(*)::int from estoque_operacoes) operacoes")).rows[0];
    }
    return {db,nf,pedido,enviar,totais};
  }

  test('SQL: duas NFs viram um custo, uma saida e duas origens', async t => {
    const a = await ambiente(t); const nfA = await a.nf(5,10,1), nfB = await a.nf(5,20);
    const r = await a.enviar(await a.pedido(7));
    assert.equal(r.custo,90); assert.equal(r.saldo,3);
    assert.deepEqual(await a.totais(), {custos:1,saidas:1,origens:2,operacoes:1});
    const rows = (await a.db.query('select nota_id,item_idx,qtd::float8 from estoque_saida_origens order by preco_origem')).rows;
    assert.deepEqual(rows,[{nota_id:nfA,item_idx:1,qtd:5},{nota_id:nfB,item_idx:0,qtd:2}]);
    assert.equal((await a.db.query('select nota_id from distribuicoes')).rows[0].nota_id,null);
  });
  test('SQL: repeticao do pedido devolve mesmos IDs; mudanca de payload e rejeitada', async t => {
    const a=await ambiente(t); await a.nf(10,10); const p=await a.pedido(3);
    const r=await a.enviar(p), retry=await a.enviar(p);
    assert.equal(retry.distribuicao_id,r.distribuicao_id); assert.equal(retry.repetida,true);
    await assert.rejects(a.enviar({...p,qtd:4}),/identificador ja usado/);
    assert.equal((await a.totais()).custos,1);
  });
  test('SQL: falha depois do custo e da distribuicao desfaz toda a operacao', async t => {
    const a=await ambiente(t); await a.nf(2,10); await a.nf(2,20);
    await a.db.exec("create function falhar_origem() returns trigger language plpgsql as $$begin if exists(select 1 from estoque_saida_origens) then raise exception 'falha injetada'; end if; return new; end$$; create trigger falhar before insert on estoque_saida_origens for each row execute function falhar_origem()");
    const p=await a.pedido(3);
    await assert.rejects(a.enviar(p),/falha injetada/);
    assert.deepEqual(await a.totais(),{custos:0,saidas:0,origens:0,operacoes:0});
    await a.db.exec('drop trigger falhar on estoque_saida_origens');
    assert.equal((await a.enviar(p)).qtd,3);
  });
  test('SQL: segunda saida respeita o saldo consumido e as origens fixadas', async t => {
    const a=await ambiente(t); await a.nf(5,10); const segunda=await a.nf(5,20);
    await a.enviar(await a.pedido(7));
    await assert.rejects(a.enviar(await a.pedido(4)),/saldo insuficiente/);
    const r=await a.enviar(await a.pedido(3)); assert.equal(r.custo,60);
    assert.equal(r.origens[0].id,segunda); assert.equal(r.saldo,0);
  });
  test('SQL: entrada sem NF e mistura com NF guardam origens distintas', async t => {
    const a=await ambiente(t); await a.nf(2,10); const ed=id(seq++);
    await a.db.query("insert into entradas_diretas(id,company_id,item_desc,codigo_catalogo,qtd,preco,data,criado_em) values($1,$2,'MATERIAL','000001',4,30,current_date-1,clock_timestamp()-interval '1 day')",[ed,company]);
    const r=await a.enviar(await a.pedido(4));
    assert.equal(r.custo,80); assert.equal(r.origens.length,2);
    const origem=(await a.db.query("select entrada_direta_id,nota_id from estoque_saida_origens where tipo='entrada_direta'")).rows[0];
    assert.deepEqual(origem,{entrada_direta_id:ed,nota_id:null});
  });
  test('SQL: contagem zero encerra lotes anteriores e permite nova NF', async t => {
    const a=await ambiente(t); await a.nf(100,1);
    await a.db.query("insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em) values($1,'MATERIAL','000001',-100,'contagem','real 0',clock_timestamp()-interval '1 day')",[company]);
    const nova=await a.nf(10,20);
    await a.db.query("update notas_fiscais set data=current_date,criado_em=clock_timestamp()-interval '1 minute' where id=$1",[nova]);
    const r=await a.enviar(await a.pedido(5));
    assert.equal(r.custo,100); assert.equal(r.origens[0].id,nova);
  });
  test('SQL: aumento contado tem origem de contagem e zeragem legada continua delta', async t => {
    const a=await ambiente(t); await a.nf(2,10);
    await a.db.query("insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em) values($1,'MATERIAL','000001',-2,'ajuste','Zeragem manual',clock_timestamp()-interval '1 day'),($1,'MATERIAL','000001',3,'contagem','real 3',clock_timestamp()-interval '1 hour')",[company]);
    const r=await a.enviar(await a.pedido(3)); assert.equal(r.origens[0].tipo,'contagem'); assert.equal(r.saldo,0);
  });
  test('SQL: criterio medio mantem custo atual e total distribuido nas origens', async t => {
    const a=await ambiente(t); await a.nf(5,10); await a.nf(5,20);
    const r=await a.enviar(await a.pedido(2,{criterio:'medio'}));
    assert.equal(r.custo,30); assert.equal(r.origens[0].preco,10);
    assert.equal(r.origens[0].custo,30);
  });
  test('SQL: excesso, nao finitos e horario futuro nao gravam', async t => {
    const a=await ambiente(t); await a.nf(5,10);
    for(const qtd of [6,0,-1,'NaN','Infinity']) await assert.rejects(a.enviar(await a.pedido(qtd)),/saldo insuficiente|pedido de saida invalido/);
    await assert.rejects(a.enviar(await a.pedido(1,{time:'2999-01-01T12:00:00Z'})),/sem data futura/);
    assert.equal((await a.totais()).custos,0);
  });
  test('SQL: outra empresa, papel de leitura e sessao ausente sao rejeitados', async t => {
    const a=await ambiente(t); await a.nf(5,10);
    const outroMaterial=id(seq++),outraObra=id(seq++);
    await a.db.query("insert into materiais(id,company_id,codigo,nome) values($1,$2,'000001','OUTRO');",[outroMaterial,other]);
    await a.db.query("insert into obras(id,company_id,nome) values($1,$2,'OUTRA');",[outraObra,other]);
    await assert.rejects(a.enviar(await a.pedido(1,{material:outroMaterial})),/material indisponivel/);
    await assert.rejects(a.enviar(await a.pedido(1,{obra:outraObra})),/obra indisponivel/);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[reader]);
    await assert.rejects(a.enviar(await a.pedido(1)),/perfil sem permissao/);
    await a.db.query("select set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(a.enviar(await a.pedido(1)),/sessao sem empresa/);
    assert.equal((await a.totais()).custos,0);
  });
  test('SQL: desativada por padrao; cliente nao escreve config/origens nem chama helper', async t => {
    const a=await ambiente(t,false); await a.nf(5,10);
    await assert.rejects(a.enviar(await a.pedido(1)),/ainda nao habilitada/);
    await a.db.exec('set role authenticated');
    await assert.rejects(a.db.exec('update estoque_transacao_config set habilitado=true'),/permission denied/);
    await assert.rejects(a.db.exec('delete from estoque_saida_origens'),/permission denied/);
    await assert.rejects(a.db.query('select _estoque_tx_lock($1)',[company]),/permission denied/);
    const rows=(await a.db.query('select * from estoque_saida_origens')).rows; assert.equal(rows.length,0);
    await a.db.exec('reset role');
  });
  test('SQL: RLS das origens esconde as parcelas da outra empresa', async t => {
    const a=await ambiente(t); await a.nf(5,10); await a.enviar(await a.pedido(1));
    await a.db.exec('set role authenticated');
    assert.equal((await a.db.query('select * from estoque_saida_origens')).rows.length,1);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(999)]);
    assert.equal((await a.db.query('select * from estoque_saida_origens')).rows.length,0);
  });
  test('SQL: origem consumida nao pode ser devolvida, apagada ou reescrita', async t => {
    const a=await ambiente(t); const nf=await a.nf(5,10); await a.enviar(await a.pedido(1));
    await assert.rejects(a.db.query('delete from notas_fiscais where id=$1',[nf]),/origem ou movimento usado/);
    await assert.rejects(a.db.query("update notas_fiscais set itens='[]' where id=$1",[nf]),/origem ou movimento usado/);
    const itens=JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:1,preco:10,total:10,item_idx_origem:0}]);
    await assert.rejects(a.db.query("insert into notas_fiscais(company_id,data,fornecedor,cnpj,natureza,obra,itens,nota_origem_id,motivo_devolucao) values($1,current_date,'FORNECEDOR','12345678000100','DEVOLUCAO','EDR',$2,$3,'TESTE')",[company,itens,nf]),/compra ja usada em saida atomica/);
  });
  test('SQL: devolucao agrega linhas repetidas antes de aceitar a quantidade', async t => {
    const a=await ambiente(t); const nf=await a.nf(5,10);
    const itens=JSON.stringify([1,2].map(()=>({codigo:'000001',qtd:3,preco:10,total:30,item_idx_origem:0})));
    await assert.rejects(a.db.query("insert into notas_fiscais(company_id,data,fornecedor,cnpj,natureza,obra,itens,nota_origem_id,motivo_devolucao) values($1,current_date,'FORNECEDOR','12345678000100','DEVOLUCAO','EDR',$2,$3,'TESTE')",[company,itens,nf]),/devolucao agregada excede/);
  });
  test('SQL: exclusao isolada e custo alterado sao recusados; RPC remove o conjunto', async t => {
    const a=await ambiente(t); await a.nf(5,10); const p=await a.pedido(2); const r=await a.enviar(p);
    await assert.rejects(a.db.query('delete from distribuicoes where id=$1',[r.distribuicao_id]),/custo orfao/);
    await assert.rejects(a.db.query('update lancamentos set total=0 where id=$1',[r.lancamento_id]),/origem ou movimento usado/);
    await a.db.query('select excluir_distribuicao_estoque($1)',[r.distribuicao_id]);
    assert.deepEqual(await a.totais(),{custos:0,saidas:0,origens:0,operacoes:1});
    const retry=await a.enviar(p); assert.equal(retry.status,'excluida'); assert.equal((await a.totais()).saidas,0);
  });

  test('SQL: perfil operacional autorizado executa a RPC como authenticated', async t => {
    const a=await ambiente(t); await a.nf(5,10); const p=await a.pedido(1);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[operational]);
    await a.db.exec('set role authenticated');
    assert.equal((await a.enviar(p)).qtd,1);
    await a.db.exec('reset role');
  });
  test('SQL: alteracao retroativa que invalida origem e revertida', async t => {
    const a=await ambiente(t); await a.nf(5,10); await a.enviar(await a.pedido(3));
    await assert.rejects(a.db.query("insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em) values($1,'MATERIAL','000001',-5,'contagem','real 0',clock_timestamp()-interval '1 hour')",[company]),/historico alterado invalidou/);
    assert.equal((await a.db.query('select count(*)::int n from ajustes_estoque')).rows[0].n,0);
    assert.equal((await a.enviar(await a.pedido(2))).saldo,0);
  });
  test('SQL: chave composta rejeita referencia de outra empresa', async t => {
    const a=await ambiente(t); const nf=await a.nf(5,10); const r=await a.enviar(await a.pedido(1));
    await assert.rejects(a.db.query('update estoque_saida_origens set company_id=$1 where distribuicao_id=$2',[other,r.distribuicao_id]),/foreign key constraint|nao transferir historico/);
    assert.equal((await a.db.query('select nota_id from estoque_saida_origens')).rows[0].nota_id,nf);
  });
  test('SQL: mudanca parcial de alocacao e recusada no fim da transacao', async t => {
    const a=await ambiente(t); await a.nf(5,10); const r=await a.enviar(await a.pedido(1));
    await assert.rejects(a.db.query('update estoque_saida_origens set qtd=2 where distribuicao_id=$1',[r.distribuicao_id]),/soma das origens diverge|origens nao correspondem a saida/);
    assert.equal((await a.db.query('select qtd::float8 from estoque_saida_origens')).rows[0].qtd,1);
  });
  test('SQL: reversao anterior ao primeiro uso conserva notas e remove so o novo schema', async t => {
    const a=await ambiente(t,false); const nf=await a.nf(5,10);
    const reverse=fs.readFileSync(path.join(__dirname,'../sql/estoque-saida-atomica-rollback-DRAFT.sql'),'utf8')
      .split('-- BEGIN ESTOQUE TX ROLLBACK')[1].split('-- END ESTOQUE TX ROLLBACK')[0];
    await a.db.exec(reverse);
    assert.equal((await a.db.query('select id from notas_fiscais')).rows[0].id,nf);
    assert.equal((await a.db.query("select to_regclass('public.estoque_saida_origens') t")).rows[0].t,null);
  });
  test('SQL: reversao apos uso e bloqueada sem apagar custos ou vinculos', async t => {
    const a=await ambiente(t); await a.nf(5,10); await a.enviar(await a.pedido(1));
    const reverse=fs.readFileSync(path.join(__dirname,'../sql/estoque-saida-atomica-rollback-DRAFT.sql'),'utf8')
      .split('-- BEGIN ESTOQUE TX ROLLBACK')[1].split('-- END ESTOQUE TX ROLLBACK')[0];
    await assert.rejects(a.db.exec(reverse),/reversao bloqueada/);
    assert.deepEqual(await a.totais(),{custos:1,saidas:1,origens:1,operacoes:1});
  });


  test('SQL: deficit consentido fica sem NF e repeticao nao duplica', async t => {
    const a=await ambiente(t); await a.nf(5,10); const p=await a.pedido(8,{semOrigem:3});
    const r=await a.enviar(p); assert.equal(r.saldo,-3); assert.equal(r.sem_origem,3); assert.equal(r.custo,80);
    const o=(await a.db.query("select nota_id,item_idx,qtd::float8 from estoque_saida_origens where tipo='sem_origem'")).rows[0];
    assert.deepEqual(o,{nota_id:null,item_idx:null,qtd:3});
    assert.equal((await a.enviar(p)).distribuicao_id,r.distribuicao_id);
    assert.equal((await a.totais()).operacoes,1);
    await assert.rejects(a.enviar({...p,semOrigem:4}),/identificador ja usado/);
  });
  test('SQL: deficit maior que o consentido e custo ausente abortam tudo', async t => {
    const a=await ambiente(t); await a.nf(5,10);
    await assert.rejects(a.enviar(await a.pedido(8,{semOrigem:2})),/saldo insuficiente/);
    assert.equal((await a.totais()).saidas,0);
    await a.db.exec('delete from notas_fiscais');
    await assert.rejects(a.enviar(await a.pedido(2,{semOrigem:2})),/custo unitario/);
    assert.equal((await a.totais()).custos,0);
    const r=await a.enviar(await a.pedido(2,{semOrigem:2,precoManual:7,criterio:'medio'}));
    assert.equal(r.custo,14); assert.equal(r.saldo,-2); assert.equal(r.origens[0].tipo,'sem_origem');
  });
  test('SQL: entrada posterior recompoe saldo e conserva conferencia de origem', async t => {
    const a=await ambiente(t); await a.nf(5,10);
    const r=await a.enviar(await a.pedido(8,{semOrigem:3}));
    const nova=id(seq++);
    await a.db.query("insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,itens) values($1,$2,(clock_timestamp() at time zone 'America/Sao_Paulo')::date,clock_timestamp(),'FORNECEDOR','12345678000100','EDR',$3)",
      [nova,company,JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:5,preco:20,total:100}])]);
    const lotes=(await a.db.query('select _estoque_tx_lotes(m,clock_timestamp()) as r from materiais m where id=$1',[material])).rows[0].r;
    assert.equal(lotes.saldo,2);
    const itens=JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:1,preco:20,total:20,item_idx_origem:0}]);
    await assert.rejects(a.db.query("insert into notas_fiscais(company_id,data,fornecedor,cnpj,natureza,obra,itens,nota_origem_id,motivo_devolucao) values($1,current_date,'FORNECEDOR','12345678000100','DEVOLUCAO','EDR',$2,$3,'TESTE')",[company,itens,nova]),/sem origem/);
    assert.equal((await a.db.query("select nota_id from estoque_saida_origens where tipo='sem_origem'")).rows[0].nota_id,null);
    await a.db.query('select excluir_distribuicao_estoque($1)',[r.distribuicao_id]);
    assert.equal((await a.db.query("select count(*)::int n from estoque_saida_origens where tipo='sem_origem'")).rows[0].n,0);
  });
  test('SQL: status informa contrato e desativacao sem conceder escrita ao cliente', async t => {
    const a=await ambiente(t,false); await a.db.exec('set role authenticated');
    const r=(await a.db.query('select estoque_operacao_status() r')).rows[0].r;
    assert.equal(r.contrato,2); assert.equal(r.habilitado,false); assert.equal(r.company_id,company);
    assert.match(r.hoje,/^\d{4}-\d{2}-\d{2}$/); assert.ok(Number.isFinite(Date.parse(r.agora)));
  });
  test('integracao local: botoes e ponte reais gravam no PostgreSQL e recarregam as origens', async t => {
    const a=await ambiente(t); await a.nf(5,10); await a.nf(5,20);
    const vm=require('node:vm'), campos={}, avisos=[], storage=new Map();
    const hoje=(await a.db.query("select (clock_timestamp() at time zone 'America/Sao_Paulo')::date::text hoje")).rows[0].hoje;
    const ctx={console:{log(){},warn(){},error(){}},document:{currentScript:null,addEventListener(){},getElementById:id=>campos[id]||null,querySelectorAll:()=>[]},
      window:{},crypto:require('node:crypto').webcrypto,usuarioAtual:{id:admin},setTimeout(){},clearTimeout(){},
      localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
      custoClassificacaoNovo:()=>({}),COMPANY_DEFAULTS:{estoqueGeral:'EDR'},norm:s=>String(s||'').toUpperCase().trim(),
      hojeISO:()=>hoje,parseItens:n=>typeof n.itens==='string'?JSON.parse(n.itens):n.itens,fmtR:String,fmtQtd:String,esc:String,confirm:()=>true};
    ctx.fetch=async (url,opts={})=>{
      const endpoint=new URL(url).pathname.split('/').at(-1);
      let body;
      try {
        if (endpoint==='estoque_operacao_status') body=(await a.db.query('select estoque_operacao_status() r')).rows[0].r;
        else if(endpoint==='registrar_saida_estoque_atomica'){
          const p=JSON.parse(opts.body);
          body=await a.enviar({operacao:p.p_operacao_id,material:p.p_material_id,obra:p.p_obra_id,qtd:p.p_qtd,time:p.p_efetivo_em,
            etapa:p.p_etapa,criterio:p.p_criterio,destino:p.p_destino_custo,adicional:p.p_adicional_id,obs:p.p_obs,
            semOrigem:p.p_sem_origem_confirmada,precoManual:p.p_preco_manual});
        } else {
          assert.ok(['notas_fiscais','lancamentos','distribuicoes','entradas_diretas','ajustes_estoque','materiais','estoque_saida_origens'].includes(endpoint));
          assert.ok(!opts.method || opts.method==='GET','nao pode gravar pelo caminho legado');
          body=(await a.db.query('select * from public.'+endpoint+' where company_id=$1',[company])).rows;
        }
        return {ok:true,status:200,json:async()=>body};
      } catch(e) { throw e; }
    };
    vm.createContext(ctx);
    const infra=fs.readFileSync(path.join(__dirname,'../js/edr-v2-infra.js'),'utf8');
    const stock=require('./fixtures/custo-nota.cjs').fonte + fs.readFileSync(path.join(__dirname,'../js/edr-v2-estoque.js'), 'utf8');
    ctx.avisos=avisos;ctx.empresa=company;ctx.obra=obra;ctx.ator=admin;
    vm.runInContext(infra+'\n'+stock+"\n_companyId=empresa;usuarioAtual.id=ator;obras=[{id:obra,nome:'OBRA'}];showToast=m=>avisos.push(m);renderEstoque=()=>{};closeModal=()=>{};fecharModal=()=>{};confirmar=async()=>true; globalThis.api={loadNotas,loadMateriais,consolidarEstoque,confirmarDistribuicaoItem,salvarSaidaMaterial,distribuicoes:()=>distribuicoes,material:()=>EstoqueModule.catalogoMateriais=catalogoMateriais};",ctx);
    await ctx.api.loadNotas();await ctx.api.loadMateriais();ctx.api.material();
    const item=ctx.api.consolidarEstoque()[0];
    await ctx.api.confirmarDistribuicaoItem(item.chave,obra,'04_alven',7,hoje);
    assert.equal((await a.totais()).saidas,1,avisos.join(' | '));
    assert.equal(ctx.api.distribuicoes()[0].origens.length,2);
    for(const [id,value] of Object.entries({'saida-desc':'MATERIAL','saida-qtd':'1','saida-unidade':'UN','saida-data':hoje,'saida-obra':obra,'saida-etapa':'04_alven'})) campos[id]={value};
    await ctx.api.salvarSaidaMaterial();
    assert.equal((await a.totais()).saidas,2,avisos.join(' | '));
    assert.equal(ctx.api.consolidarEstoque()[0].saldo,2);
    assert.equal(storage.size,0);
    // FIFO: primeira saida custa 90; a seguinte usa o lote de 20 (total 110).
    assert.equal((await a.db.query('select sum(total)::float8 n from lancamentos')).rows[0].n,110);
  });


  const consultaConferencia=fs.readFileSync(path.join(__dirname,'../sql/estoque-conferencia-pendencias.sql'),'utf8');
  test('conferencia: consulta somente leitura separa quantidade pendente e custo estimado', async t=>{
    const a=await ambiente(t);await a.nf(5,10);const r=await a.enviar(await a.pedido(8,{semOrigem:3}));
    const antes=await a.totais();await a.db.exec('begin read only;');
    const fila=(await a.db.query(consultaConferencia)).rows;await a.db.exec('commit;');
    assert.equal(fila.length,1);const p=fila[0];
    assert.equal(p.company_id,company);assert.equal(p.material_id,material);assert.equal(p.distribuicao_id,r.distribuicao_id);
    assert.equal(Number(p.quantidade_sem_origem),3);assert.equal(Number(p.custo_estimado_sem_origem),30);
    assert.equal(Number(p.quantidade_saida),8);assert.equal(Number(p.valor_total_saida),80);
    assert.equal(p.situacao,'aguarda_comprovacao');assert.deepEqual(await a.totais(),antes);
  });
  test('conferencia: NF posterior e contagem nao encerram pendencia nem liberam devolucao', async t=>{
    const a=await ambiente(t);await a.nf(5,10);await a.enviar(await a.pedido(8,{semOrigem:3}));
    const nova=id(seq++);
    await a.db.query("insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,itens) values($1,$2,(clock_timestamp() at time zone 'America/Sao_Paulo')::date,clock_timestamp(),'FORNECEDOR','12345678000100','EDR',$3)",
      [nova,company,JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:5,preco:20,total:100}])]);
    assert.equal((await a.db.query(consultaConferencia)).rows.length,1);
    await a.db.query("insert into ajustes_estoque(company_id,item_desc,codigo_catalogo,qtd,tipo,motivo,criado_em) values($1,'MATERIAL','000001',0,'contagem','real 2',clock_timestamp())",[company]);
    assert.equal((await a.db.query(consultaConferencia)).rows.length,1);
    const itens=JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:1,preco:20,total:20,item_idx_origem:0}]);
    await assert.rejects(a.db.query("insert into notas_fiscais(company_id,data,fornecedor,cnpj,natureza,obra,itens,nota_origem_id,motivo_devolucao) values($1,current_date,'FORNECEDOR','12345678000100','DEVOLUCAO','EDR',$2,$3,'TESTE')",[company,itens,nova]),/sem origem/);
  });
  test('conferencia: fila authenticated nao vaza empresa e sem sessao retorna vazio', async t=>{
    const a=await ambiente(t);await a.nf(5,10);await a.enviar(await a.pedido(8,{semOrigem:3}));
    await a.db.query("insert into company_users values($1,$2,'admin')",[id(998),other]);
    await a.db.exec('grant select on distribuicoes,materiais to authenticated;set role authenticated;');
    assert.equal((await a.db.query(consultaConferencia)).rows.length,1);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)",[id(998)]);
    assert.equal((await a.db.query(consultaConferencia)).rows.length,0);
    await a.db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await a.db.query(consultaConferencia)).rows.length,0);
  });
  test('conferencia: exclusao conjunta retira pendencia e repeticao nao recria saida', async t=>{
    const a=await ambiente(t);await a.nf(5,10);const p=await a.pedido(8,{semOrigem:3}),r=await a.enviar(p);
    assert.equal((await a.db.query(consultaConferencia)).rows.length,1);
    await a.db.query('select excluir_distribuicao_estoque($1)',[r.distribuicao_id]);
    assert.equal((await a.db.query(consultaConferencia)).rows.length,0);
    assert.equal((await a.enviar(p)).status,'excluida');
    assert.deepEqual(await a.totais(),{custos:0,saidas:0,origens:0,operacoes:1});
  });

  test('SQL: escrita legada de almoxarifado bloqueada quando modo atomico esta ativo', async t => {
    const a=await ambiente(t); await a.nf(5,10);
    await assert.rejects(a.db.query("insert into distribuicoes(company_id,item_desc,item_idx,obra_nome,qtd,valor,codigo_catalogo) values($1,'MATERIAL',0,'OBRA',1,10,'000001')",[company]),/exige operacao atomica/);
  });
  test('SQL: FIFO inclui desconto, frete e despesas e devolucao retira custo da origem',async t=>{
    const a=await ambiente(t);const origem=await a.nf(10,40);
    await a.db.query('update notas_fiscais set desconto_total=40,frete=40,outras_despesas=10,valor_bruto=410 where id=$1',[origem]);
    const devolvida=id(seq++);
    await a.db.query("insert into notas_fiscais(id,company_id,data,criado_em,fornecedor,cnpj,obra,natureza,nota_origem_id,motivo_devolucao,itens,valor_bruto) values($1,$2,current_date-1,clock_timestamp()-interval '1 day','FORNECEDOR','12345678000100','EDR','DEVOLUCAO',$3,'ENSAIO',$4,80)",
      [devolvida,company,origem,JSON.stringify([{codigo:'000001',desc:'MATERIAL',qtd:2,preco:40,total:80,item_idx_origem:0}])]);
    const r=await a.enviar(await a.pedido(3));assert.equal(r.custo,123);assert.equal(r.saldo,5);
    await assert.rejects(a.db.query('update notas_fiscais set frete=100 where id=$1',[origem]),/origem|usad|historico/);
  });
}
