'use strict';
// Banco PostgreSQL embutido, sem rede, dados integralmente sintéticos.
// Executar: EDR_PGLITE_PATH=<modulo @electric-sql/pglite> node --test este-arquivo
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../sql/contas-parcelamento-DRAFT.sql'), 'utf8');
const id = n => '10000000-0000-4000-8000-' + String(n).padStart(12, '0');
const empresa = id(1), outra = id(2), admin = id(3), leitor = id(4), nf = id(5), obra = id(6);
const pedido = (extra = {}) => ({
  modo: 'nota', nota_id: nf, fornecedor: 'FORNECEDOR SINTÉTICO',
  descricao: 'NF SINTÉTICA 321/1', obra_id: obra, nota_ref: '321/1', status: 'pendente',
  parcelas: [
    { numero: '001', valor_centavos: 90001, vencimento: '2026-10-28' },
    { numero: '002', valor_centavos: 80002, vencimento: '2026-11-30' },
  ],
  ...extra,
});
const original = c => ({
  valor_centavos: Math.round(Number(c.valor) * 100), status: c.status,
  data_vencimento: c.data_vencimento, fornecedor: c.fornecedor, descricao: c.descricao,
  obra_id: c.obra_id, nota_id: c.nota_id, nota_ref: c.nota_ref,
});

test('migration não muda permissões, policies nem registros históricos', () => {
  assert.match(sql, /security invoker/i);
  assert.doesNotMatch(sql, /\bsecurity\s+definer\b|\b(grant|revoke|create\s+policy|alter\s+policy|enable\s+row\s+level)\b/i);
  assert.doesNotMatch(sql, /delete from public\./i);
});

if (!process.env.EDR_PGLITE_PATH) {
  test('parcelamento SQL', { skip: 'Defina EDR_PGLITE_PATH; SQL ainda não executado' }, () => {});
} else {
  const { PGlite } = require(process.env.EDR_PGLITE_PATH);
  async function preparar(t) {
    const db = new PGlite();
    t.after(() => db.close());
    await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/contas-parcelamento-base.sql'),'utf8'));
    await db.exec(sql);
    for (const table of ['obras', 'notas_fiscais', 'contas_pagar', 'lancamentos', 'caixa_obrigacoes', 'caixa_movimentos']) {
      await db.exec(`alter table ${table} enable row level security;
        create policy tenant on ${table} to authenticated using(company_id=auth_company_id())
        with check(company_id=auth_company_id() and auth_user_role()='admin');
        grant select,insert,update,delete on ${table} to authenticated;`);
    }
    await db.exec('grant usage on schema auth to authenticated');
    await db.query('insert into companies values($1),($2)', [empresa, outra]);
    await db.query("insert into company_users(user_id,company_id,role) values($1,$2,'admin'),($3,$2,'leitura')", [admin, empresa, leitor]);
    await db.query("insert into obras values($1,$2,'OBRA SINTÉTICA')", [obra, empresa]);
    await db.query("insert into notas_fiscais(id,company_id,numero_nf,fornecedor,valor_bruto) values($1,$2,'321/1','FORNECEDOR SINTÉTICO',1854.17)", [nf, empresa]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await db.exec('set role authenticated');
    return {
      db,
      async enviar(p = pedido(), op = id(20)) {
        return (await db.query('select public.registrar_parcelas_conta($1,$2) resultado', [op, p])).rows[0].resultado;
      },
      async contas() { return (await db.query('select * from contas_pagar order by data_vencimento,id')).rows; },
      async total() { return Number((await db.query('select coalesce(sum(valor),0) total from contas_pagar')).rows[0].total); },
      async inserir(extra = {}) {
        const c = { id: id(10), company_id: empresa, fornecedor: 'FORNECEDOR SINTÉTICO',
          descricao: 'NF SINTÉTICA 321/1', valor: 1854.17, data_vencimento: '2026-10-28',
          obra_id: obra, nota_id: nf, nota_ref: '321/1', status: 'pendente', data_pagamento: null, tipo: null, ...extra };
        await db.query(`insert into contas_pagar(id,company_id,fornecedor,descricao,valor,data_vencimento,
          obra_id,nota_id,nota_ref,status,data_pagamento,tipo) values(${Object.keys(c).map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(c));
        return c;
      },
    };
  }
  const desdobrar = (c, extra = {}) => pedido({
    modo: 'desdobrar', conta_id: c.id, original: original(c), aceitar_divergencia: true,
    motivo: 'Total original presumido; conferência dos boletos sintéticos.', ...extra,
  });

  test('duas parcelas desiguais e vencimentos independentes; divergência da NF não bloqueia', async t => {
    const a = await preparar(t), r = await a.enviar();
    assert.equal(r.repetida, false);
    assert.deepEqual(r.contas.map(c => [Number(c.valor), c.data_vencimento]), [[900.01, '2026-10-28'], [800.02, '2026-11-30']]);
    assert.equal(await a.total(), 1700.03);
    assert.ok(r.contas.every(c => c.nota_id === nf && c.nota_ref === '321/1' && c.company_id === empresa));
    assert.equal((await a.db.query('select count(*) n from caixa_movimentos')).rows[0].n, 0);
  });
  test('uma parcela e pagamento à vista preservam status/data sem criar caixa', async t => {
    const a = await preparar(t), r = await a.enviar(pedido({
      status: 'pago', data_pagamento: '2026-10-20',
      parcelas: [{ numero: '', valor_centavos: 185417, vencimento: '2026-10-20' }],
    }));
    assert.equal(r.contas.length, 1);
    assert.equal(r.contas[0].status, 'pago');
    assert.equal(r.contas[0].data_pagamento, '2026-10-20');
    assert.equal(Number(r.contas[0].valor), 1854.17);
  });
  test('retry após resposta perdida retorna mesmas contas, não duplica; UUID não aceita payload alterado', async t => {
    const a = await preparar(t), first = await a.enviar(), retry = await a.enviar();
    assert.equal(retry.repetida, true);
    assert.deepEqual(retry.contas.map(c => c.id), first.contas.map(c => c.id));
    assert.equal((await a.contas()).length, 2);
    await assert.rejects(a.enviar(pedido({ motivo: 'outro pedido' })), /dados diferentes/);
    assert.equal(await a.total(), 1700.03);
  });
  test('segunda operação para mesma NF e duplicata legada não geram nova obrigação', async t => {
    const a = await preparar(t);
    await a.enviar();
    await assert.rejects(a.enviar(pedido(), id(21)), /já possui conta/);
    assert.equal((await a.contas()).length, 2);
  });
  test('mesmo número de outro fornecedor não é duplicata; legado do mesmo fornecedor bloqueia', async t => {
    const a = await preparar(t);
    await a.inserir({ nota_id: null, fornecedor: 'OUTRO FORNECEDOR' });
    await a.enviar();
    assert.equal((await a.contas()).length, 3);
    const b = await preparar(t);
    await b.inserir({ nota_id: null });
    await assert.rejects(b.enviar(), /já possui conta/);
  });
  test('valores ausentes, zero, negativos, centavos fracionados, data inválida e número repetido não gravam', async t => {
    const a = await preparar(t);
    for (const parcelas of [
      [], [{ numero: '', vencimento: '2026-10-28' }],
      [{ numero: '', valor_centavos: 0, vencimento: '2026-10-28' }],
      [{ numero: '', valor_centavos: -100, vencimento: '2026-10-28' }],
      [{ numero: '', valor_centavos: 1.1, vencimento: '2026-10-28' }],
      [{ numero: '', valor_centavos: 10, vencimento: '' }],
      [{ numero: '', valor_centavos: 10, vencimento: '2026-02-30' }],
      [{ numero: '001', valor_centavos: 10, vencimento: '2026-10-28' }, { numero: '001', valor_centavos: 20, vencimento: '2026-11-28' }],
    ]) await assert.rejects(a.enviar(pedido({ parcelas })));
    assert.equal((await a.contas()).length, 0);
  });
  test('falha na segunda parcela reverte primeira, recibo e atualização original', async t => {
    const a = await preparar(t), c = await a.inserir();
    await a.db.exec(`reset role; create function falha_parcela() returns trigger language plpgsql as
      $$begin if new.valor=800.02 then raise exception 'falha sintética'; end if; return new; end$$;
      create trigger falha before insert on contas_pagar for each row execute function falha_parcela(); set role authenticated;`);
    await assert.rejects(a.enviar(desdobrar(c)), /falha sintética/);
    assert.equal((await a.contas()).length, 1);
    assert.equal(await a.total(), 1854.17);
    assert.deepEqual((await a.contas())[0].parcelamento, []);
  });
  test('desdobrar pendente mantém ID, vínculos e histórico; substitui total sem duplicá-lo', async t => {
    const a = await preparar(t), c = await a.inserir(), r = await a.enviar(desdobrar(c));
    assert.equal(r.contas[0].id, c.id);
    assert.equal(await a.total(), 1700.03);
    assert.equal((await a.contas()).length, 2);
    const h = r.contas[0].parcelamento[0];
    assert.equal(Number(h.anterior.valor), 1854.17);
    assert.equal(h.total_anterior_centavos, 185417);
    assert.equal(h.total_novo_centavos, 170003);
    assert.equal(h.usuario_id, admin);
    assert.ok(r.contas.every(x => x.nota_id === nf && x.obra_id === obra && x.fornecedor === c.fornecedor));
    assert.equal((await a.enviar(desdobrar(c))).repetida, true);
  });
  test('divergência no desdobramento exige confirmação e motivo; soma igual não exige', async t => {
    const a = await preparar(t), c = await a.inserir();
    await assert.rejects(a.enviar(desdobrar(c, { aceitar_divergencia: false })), /confirme a divergência/);
    await assert.rejects(a.enviar(desdobrar(c, { motivo: '' })), /confirme a divergência/);
    const r = await a.enviar(desdobrar(c, { aceitar_divergencia: false, motivo: '',
      parcelas: [{ numero: '', valor_centavos: 90000, vencimento: '2026-10-28' },
        { numero: '', valor_centavos: 95417, vencimento: '2026-11-28' }] }));
    assert.equal(r.contas.length, 2);
    assert.equal(await a.total(), 1854.17);
  });
  test('snapshot desatualizado, conta paga, baixa e vínculo ao Caixa impedem desdobramento', async t => {
    const a = await preparar(t), c = await a.inserir();
    await a.db.query("update contas_pagar set descricao='Alterada' where id=$1", [c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /alterada após/);
    await a.db.query("update contas_pagar set descricao=$2,status='pago' where id=$1", [c.id,c.descricao]);
    await assert.rejects(a.enviar(desdobrar(c)), /pendente sem pagamento/);
    await a.db.query("update contas_pagar set status='pendente',data_pagamento='2026-10-20' where id=$1", [c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /pendente sem pagamento/);
    await a.db.query('update contas_pagar set data_pagamento=null where id=$1', [c.id]);
    await a.db.query("update contas_pagar set data_recebimento='2026-10-20' where id=$1", [c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /pendente sem pagamento/);
    await a.db.query("update contas_pagar set data_recebimento=null,tipo='despesa_operacional_nf' where id=$1", [c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /pendente sem pagamento/);
    await a.db.query('update contas_pagar set tipo=null where id=$1', [c.id]);
    await a.db.query('insert into caixa_obrigacoes values($1,$2,185417)', [empresa,c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /vinculada ao Caixa/);
    await a.db.query('delete from caixa_obrigacoes where conta_pagar_id=$1', [c.id]);
    await a.db.query("insert into caixa_movimentos(company_id,conta_pagar_id,cancelado_em) values($1,$2,now())", [empresa,c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /histórico de baixa/);
    await a.db.query('delete from caixa_movimentos where conta_pagar_id=$1', [c.id]);
    await a.db.query('insert into lancamentos(company_id,obs) values($1,$2)', [empresa,'contas_pagar:'+c.id]);
    await assert.rejects(a.enviar(desdobrar(c)), /lançamento de baixa/);
    assert.equal(await a.total(),1854.17);
  });
  test('perfis/tenants/obra fora da empresa e NF removida não criam órfãs', async t => {
    const a = await preparar(t);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)", [leitor]);
    await assert.rejects(a.enviar(), /administrador/);
    await a.db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
    await a.db.exec('reset role');
    await a.db.query('update company_users set active=false where user_id=$1', [admin]);
    await a.db.exec('set role authenticated');
    await assert.rejects(a.enviar(), /administrador/);
    await a.db.exec('reset role');
    await a.db.query('update company_users set active=true where user_id=$1', [admin]);
    await a.db.query('update obras set company_id=$1 where id=$2', [outra,obra]);
    await a.db.exec('set role authenticated');
    await assert.rejects(a.enviar(), /Obra indisponível/);
    await a.db.query('delete from notas_fiscais where id=$1', [nf]);
    await assert.rejects(a.enviar(), /Nota fiscal removida/);
    assert.equal((await a.contas()).length,0);
  });
  test('excluir antes de salvar e reimportar com UUID novo não reaproveita pedido antigo', async t => {
    const a = await preparar(t);
    await a.db.query('delete from notas_fiscais where id=$1', [nf]);
    await a.db.query("insert into notas_fiscais(id,company_id,numero_nf,fornecedor,valor_bruto) values($1,$2,'321/1','FORNECEDOR SINTÉTICO',1854.17)", [id(50),empresa]);
    await assert.rejects(a.enviar(), /Nota fiscal removida/);
    const r = await a.enviar(pedido({ nota_id:id(50) }),id(51));
    assert.ok(r.contas.every(c => c.nota_id===id(50)));
    assert.equal((await a.contas()).length,2);
  });
  test('histórico não pode ser apagado/reescrito nem perder recibo por DELETE ou cascade NF', async t => {
    const a = await preparar(t), r = await a.enviar(), c=r.contas[0];
    await assert.rejects(a.db.query('delete from contas_pagar where id=$1',[c.id]),/preserve o registro/);
    await assert.rejects(a.db.query('delete from notas_fiscais where id=$1',[nf]),/preserve o registro/);
    await assert.rejects(a.db.query("update contas_pagar set parcelamento='[]' where id=$1",[c.id]),/deve ser preservado/);
    await assert.rejects(a.db.query("update contas_pagar set parcelamento=jsonb_set(parcelamento,'{0,total_novo_centavos}','0') where id=$1",[c.id]),/não pode ser reescrito/);
    await assert.rejects(a.db.query("update contas_pagar set valor=1 where id=$1",[c.id]),/pelo parcelamento/);
    await a.db.query("update contas_pagar set status='pago',data_pagamento='2026-10-20' where id=$1",[c.id]);
    assert.equal((await a.enviar()).repetida,true);
    assert.equal((await a.contas()).length,2);
  });
  test('novo desdobramento acrescenta histórico e conserva recibo de operações anteriores', async t => {
    const a = await preparar(t), r = await a.enviar(), c = r.contas[0];
    const novo = await a.enviar(desdobrar(c,{aceitar_divergencia:false,motivo:'',
      parcelas:[{numero:'A',valor_centavos:40000,vencimento:'2026-10-28'},{numero:'B',valor_centavos:50001,vencimento:'2026-12-28'}]}),id(22));
    assert.equal(novo.contas[0].parcelamento.length,2);
    assert.deepEqual(novo.contas[0].parcelamento[0],c.parcelamento[0]);
    assert.equal(await a.total(),1700.03);
    assert.equal((await a.enviar()).repetida,true);
    assert.equal((await a.contas()).length,3);
  });
  test('despesas operacionais anteriores exigem conferência explícita sem ratear boletos', async t => {
    const a = await preparar(t);
    await a.inserir({tipo:'despesa_operacional_nf',status:'pago',valor:100,data_pagamento:'2026-10-20'});
    await assert.rejects(a.enviar(),/já estão no Financeiro/);
    const r=await a.enviar(pedido({aceitar_divergencia:true,motivo:'Boletos conferidos excluem despesa anterior'}));
    assert.equal(r.contas.length,2);
    assert.equal(await a.total(),1800.03);
    assert.equal((await a.contas()).filter(c=>c.tipo==='despesa_operacional_nf').length,1);
  });
  for (const caso of [
    {numero:'211923/1',total:1854.17,credito:162.97,parcelas:[
      {numero:'001',valor_centavos:92708,vencimento:'2026-10-28'},
      {numero:'002',valor_centavos:92709,vencimento:'2026-11-04'}]},
    {numero:'213180/1',total:827.51,credito:340.46,parcelas:[
      {numero:'001',valor_centavos:41375,vencimento:'2026-11-05'},
      {numero:'002',valor_centavos:41376,vencimento:'2026-11-12'}]},
  ]) test('boletos sintéticos NF '+caso.numero+': preserva centavo/data e não abate crédito fiscal',async t=>{
    const a=await preparar(t);
    await a.db.query('update notas_fiscais set numero_nf=$1,valor_bruto=$2,imposto=$3,gera_credito=true where id=$4',
      [caso.numero,caso.total,caso.credito,nf]);
    const p=pedido({nota_ref:caso.numero,parcelas:caso.parcelas});
    const r=await a.enviar(p);
    assert.deepEqual(r.contas.map(c=>[Math.round(Number(c.valor)*100),c.data_vencimento]),
      caso.parcelas.map(p=>[p.valor_centavos,p.vencimento]));
    assert.equal(await a.total(),caso.total);
    assert.notEqual(await a.total(),Number((caso.total-caso.credito).toFixed(2)));
    assert.ok(r.contas.every(c=>c.nota_ref===caso.numero&&c.nota_id===nf));
    assert.equal((await a.enviar(p)).repetida,true);
  });
  test('CHECK de histórico rejeita INSERTs diretos que não são array',async t=>{
    const a=await preparar(t);
    await assert.rejects(a.db.query("insert into contas_pagar(company_id,valor,parcelamento) values($1,10,'{}')",[empresa]),/contas_pagar_parcelamento_array/);
    await assert.rejects(a.db.query('insert into contas_pagar(company_id,valor,parcelamento) values($1,10,null)',[empresa]),/not-null/);
    assert.equal((await a.contas()).length,0);
  });
  test('INSERT de aba antiga não recria total depois do parcelamento; fluxos especiais preservados',async t=>{
    const a=await preparar(t);await a.enviar();
    await assert.rejects(a.inserir(),/já possui parcelamento/);
    await assert.rejects(a.db.query("insert into contas_pagar(company_id,nota_id,valor,parcelamento) values($1,$2,1854.17,$3)",
      [empresa,nf,JSON.stringify([{operacao_id:id(99),conta_ids:[id(98)]}])]),/não pertence à operação/);
    assert.equal((await a.contas()).length,2);
    await a.inserir({id:id(60),tipo:'despesa_operacional_nf',valor:50});
    await a.inserir({id:id(61),tipo:'reembolso_fornecedor',valor:60});
    assert.equal((await a.contas()).length,4);
  });
}
