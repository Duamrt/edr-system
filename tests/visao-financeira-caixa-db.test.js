'use strict';
// Contrato real RPC -> loader/modelo em PostgreSQL descartavel e dados sinteticos.
// Nenhuma conexao externa, DOM, credencial, migracao remota ou escrita operacional.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

if (!process.env.EDR_PGLITE_PATH) {
  test('visao financeira: contrato PostgreSQL Caixa -> loader/modelo', {
    skip: 'Defina EDR_PGLITE_PATH; contrato SQL real nao foi executado.'
  }, () => {});
} else {
  const { PGlite } = require(process.env.EDR_PGLITE_PATH);
  const Dados = require('../js/edr-v2-visao-financeira-dados.js');
  const Modelo = require('../js/edr-v2-visao-financeira-modelo.js');
  const raiz = path.resolve(__dirname, '..');
  const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/caixa-prospectivo-base.sql'), 'utf8');
  const sql = fs.readFileSync(path.join(raiz, 'sql/caixa-prospectivo-DRAFT.sql'), 'utf8');
  const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
  const empresa = id(1), outraEmpresa = id(2), admin = id(3), outroAdmin = id(4), obra = id(5);
  const parcial = id(10), pendente = id(11), antigaPaga = id(12), cancelada = id(13), reembolso = id(14);

  test('visao financeira: JSON canônico Caixa confirmado pelo loader e saldo separado dos custos', async t => {
    const db = new PGlite(); t.after(() => db.close());
    await db.exec(fixture); await db.exec(sql);
    await db.query('insert into companies(id) values($1),($2)', [empresa, outraEmpresa]);
    await db.query("insert into company_users(user_id,company_id,role) values($1,$2,'admin'),($3,$4,'admin')", [admin, empresa, outroAdmin, outraEmpresa]);
    for (const [cp, tenant, valor, status, tipo] of [
      [parcial, empresa, 400, 'pendente', 'despesa'], [pendente, empresa, 100, 'pendente', 'despesa'],
      [antigaPaga, empresa, 50, 'pago', 'despesa'], [cancelada, empresa, 20, 'cancelado', 'despesa'],
      [reembolso, empresa, 60, 'pendente', 'reembolso_fornecedor'], [id(15), outraEmpresa, 999, 'pendente', 'despesa']
    ]) await db.query('insert into contas_pagar(id,company_id,valor,status,tipo,descricao,data_vencimento,data_pagamento) values($1,$2,$3,$4,$5,$6,$7,$8)',
      [cp, tenant, valor, status, tipo, 'Obrigacao ficticia ' + cp.slice(-2), '2001-05-01', status === 'pago' ? '2001-06-04' : null]);
    async function sessao(ator) {
      await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ator]);
      await db.exec('set role authenticated');
    }
    await sessao(admin);
    let sequencia = 100;
    const registrar = async (pedido, operacao = id(sequencia++)) =>
      (await db.query('select public.caixa_registrar($1,$2::jsonb) resultado', [operacao, JSON.stringify(pedido)])).rows[0].resultado;
    const estado = async () => (await db.query('select public.caixa_estado() estado')).rows[0].estado;
    const semAbertura = await estado();
    const abertura = await registrar({ action: 'abertura', corte_local: '2001-06-05T18:23', fuso: 'America/Sao_Paulo', contas: [
      { codigo: 'banco', nome: 'Banco ficticio contrato', saldo_centavos: 100000 },
      { codigo: 'dinheiro', nome: 'Dinheiro ficticio contrato', saldo_centavos: 20000 }
    ] });
    assert.equal(abertura.company_id, empresa);
    const abertas = await estado();
    const banco = abertas.contas.find(c => c.codigo === 'banco').id;
    const dinheiro = abertas.contas.find(c => c.codigo === 'dinheiro').id;
    const mover = (campos, operacao) => registrar({ action: 'movimento', tipo: 'entrada', conta_id: banco, destino_id: null,
      valor_centavos: 100, data_efetiva: '2001-06-06', hora_efetiva: null, decisao_corte: null,
      descricao: 'Movimento ficticio contrato', conta_pagar_id: null, ...campos }, operacao);
    await mover({ valor_centavos: 2500, hora_efetiva: '09:07', descricao: 'Entrada ficticia contrato' });
    await mover({ tipo: 'saida', valor_centavos: 1000, descricao: 'Saida ficticia contrato' });
    const pedidoTransferencia = { tipo: 'transferencia', destino_id: dinheiro, valor_centavos: 5000, hora_efetiva: '14:30', descricao: 'Transferencia ficticia contrato' };
    const opTransferencia = id(sequencia++), transferencia = await mover(pedidoTransferencia, opTransferencia);
    await mover({ tipo: 'saida', valor_centavos: 250, hora_efetiva: '14:31', descricao: 'Tarifa ficticia separada' });
    await mover({ tipo: 'pagamento', conta_pagar_id: parcial, valor_centavos: 15000, hora_efetiva: '15:00', descricao: 'Pagamento parcial ficticio' });
    const aCancelar = await mover({ tipo: 'saida', valor_centavos: 2000, hora_efetiva: '15:40', descricao: 'Saida ficticia cancelada' });
    await registrar({ action: 'cancelar', movimento_id: aCancelar.movimento_id, motivo: 'Correção fictícia de contrato' });
    const incluido = await mover({ valor_centavos: 7777, data_efetiva: '2001-06-05', decisao_corte: 'incluido_abertura', descricao: 'Declarado incluido sem horario' });
    const exato = await mover({ tipo: 'saida', valor_centavos: 300, data_efetiva: '2001-06-05', hora_efetiva: '18:23', descricao: 'Exatamente no corte ficticio' });
    const anterior = await mover({ valor_centavos: 333, data_efetiva: '2001-06-04', descricao: 'Anterior ao corte ficticio' });
    const real = await estado();
    const cpReais = (await db.query('select * from public.contas_pagar order by id')).rows;
    const comTenant = (n, campos) => ({ id: id(n), company_id: empresa, ...campos });
    const fontes = {
      obras: [comTenant(5, { nome: 'Cliente ficticio contrato', valor_venda: 5000, area_m2: 50, arquivada: false })],
      lancamentos: [comTenant(30, { obra_id: obra, etapa: '28_mao', total: 2000, data: '2001-06-06' }),
        comTenant(31, { obra_id: obra, etapa: '01_material', total: 3000, data: '2001-06-06' })],
      repasses_cef: [comTenant(32, { obra_id: obra, tipo: 'pls', valor: 4500, data_credito: '2001-06-06' })],
      obra_adicionais: [comTenant(33, { obra_id: obra, status: 'aprovado', valor: 500 }), comTenant(34, { obra_id: obra, status: 'pendente', valor: 300 })],
      adicional_pagamentos: [comTenant(35, { adicional_id: id(33), valor: 125, data: '2001-06-06' })],
      contas_pagar: cpReais, notas_fiscais: [], diarias_quinzenas: [], diarias: [], diarias_extras: []
    };
    const proibido = () => { throw Error('Efeito externo proibido no teste DRE'); };
    const contexto = { window: {}, sbGet: proibido, fetch: proibido, document: { getElementById: proibido } };
    vm.createContext(contexto); vm.runInContext(fs.readFileSync(path.join(raiz, 'js/edr-v2-dre.js'), 'utf8'), contexto);
    function leitura(jsonRpc) {
      const chamadas = [];
      let chamadasLedger = 0;
      const loader = Dados.criar({
        obterIdentidade: () => ({ company_id: empresa, ator_id: admin, perfil: 'admin' }), obrasInternas: [],
        obterPagina: async (tabela, query) => {
          assert.ok(Object.hasOwn(fontes, tabela));
          const q = new URLSearchParams(query.slice(1));
          assert.equal(q.get('limit'), '1000'); assert.ok(q.get('select')); assert.ok(q.get('order'));
          const offset = Number(q.get('offset')); chamadas.push({ tabela, offset });
          // Servidor ficticio limita a dois registros; pagina vazia confirma fim.
          return fontes[tabela].slice(offset, offset + 2);
        },
        carregarLedger: async () => { chamadasLedger++; return jsonRpc; },
        criarDre: snapshot => contexto.window.DREModule.criarContextoLeitura(snapshot)
      });
      return { loader, chamadas, chamadasLedger: () => chamadasLedger };
    }

    await t.test('JSON real usa HH:mm, null e flags de cancelamento/corte aceitas sem adaptações', () => {
      assert.equal(real.company_id, empresa); assert.equal(real.movimentos.length, 9);
      const m = idMov => real.movimentos.find(x => x.id === idMov);
      assert.equal(real.movimentos.find(x => x.descricao === 'Entrada ficticia contrato').hora_efetiva, '09:07');
      assert.equal(real.movimentos.find(x => x.descricao === 'Saida ficticia contrato').hora_efetiva, null);
      assert.equal(m(aCancelar.movimento_id).afeta_saldo, false); assert.ok(m(aCancelar.movimento_id).cancelado_em);
      assert.equal(m(aCancelar.movimento_id).motivo_cancelamento, 'Correção fictícia de contrato');
      for (const recibo of [incluido, exato, anterior]) {
        assert.equal(m(recibo.movimento_id).afeta_saldo, false);
        assert.equal(m(recibo.movimento_id).decisao_corte, 'incluido_abertura');
      }
      assert.equal(m(incluido.movimento_id).hora_efetiva, null);
      assert.equal(m(exato.movimento_id).hora_efetiva, '18:23');
      assert.equal(m(transferencia.movimento_id).destino_id, dinheiro);
    });

    const a = leitura(real), snapshot = await a.loader.carregar();
    await t.test('loader confirma resposta real direta, fontes paginadas, identidade e contexto DRE', () => {
      assert.equal(snapshot.status, 'confirmada'); assert.equal(snapshot.ledger.status, 'confirmada');
      assert.equal(snapshot.fontes.ledger.quantidade, 9); assert.equal(snapshot.dre.status, 'confirmada');
      assert.deepEqual(snapshot.ledger.estado, real); assert.equal(a.chamadasLedger(), 1);
      assert.equal(Object.isFrozen(snapshot.ledger.estado), true);
      assert.deepEqual(a.chamadas.filter(c => c.tabela === 'contas_pagar').map(c => c.offset), [0, 2, 4, 5]);
      assert.equal(snapshot.contasPagar.length, 5); assert.ok(snapshot.contasPagar.every(c => c.company_id === empresa));
      for (const status of Object.values(snapshot.dominios)) assert.equal(status.status, 'confirmada');
    });

    await t.test('modelo conserva saldo atual por conta e total mesmo mudando período/obra; custo não é pagamento', () => {
      for (const filtro of [{ periodo: '2001-06' }, { periodo: '2001-07', obraId: obra }, { periodo: '', obraId: id(999) }]) {
        const visao = Modelo.construir(snapshot, filtro);
        assert.equal(visao.saldo.status, 'confirmada'); assert.equal(visao.saldo.totalCentavos, 106250);
        assert.deepEqual(visao.saldo.contas.map(c => [c.codigo, c.saldoCentavos]), [['banco', 81250], ['dinheiro', 25000]]);
        assert.equal(visao.saldo.contas.reduce((s, c) => s + c.saldoCentavos, 0), visao.saldo.totalCentavos);
        assert.equal(visao.escopos.saldo, 'empresa_atual_sem_rateio'); assert.equal(visao.saldo.periodo, 'atual');
      }
      const visao = Modelo.construir(snapshot, { periodo: '2001-06' });
      assert.equal(visao.totais.custoPeriodoCentavos, 500000);
      assert.equal(visao.totais.recebidoPeriodoCentavos, 462500);
      assert.equal(visao.dre.empresa.status, 'confirmada');
      assert.notEqual(visao.totais.diferencaRecebidoCustoCentavos, visao.saldo.totalCentavos);
    });

    await t.test('restante real de obrigação parcial fica separado do saldo; antigas pagas/reembolso/canceladas preservadas', () => {
      const pagos = new Map(snapshot.ledger.estado.pagamentos.map(p => [p.conta_pagar_id, p]));
      assert.deepEqual(pagos.get(parcial), { conta_pagar_id: parcial, pago_centavos: 15000, restante_centavos: 25000 });
      assert.deepEqual(pagos.get(antigaPaga), { conta_pagar_id: antigaPaga, pago_centavos: 5000, restante_centavos: 0 });
      assert.equal(pagos.get(pendente).restante_centavos, 10000); assert.equal(pagos.get(cancelada).restante_centavos, 0);
      assert.equal(pagos.has(reembolso), false); assert.equal(pagos.has(id(15)), false);
      assert.equal(snapshot.contasPagar.find(c => c.id === parcial).status, 'pendente');
      assert.equal(snapshot.contasPagar.find(c => c.id === parcial).data_pagamento, null);
      assert.equal(snapshot.dominios.obrigacoes.status, 'confirmada');
      const restante = [...pagos.values()].reduce((s, p) => s + p.restante_centavos, 0);
      assert.equal(restante, 35000); assert.equal(Modelo.construir(snapshot).saldo.totalCentavos, 106250);
    });

    await t.test('retry de transferência não duplica movimentos/recibos/saldo no contrato consumido', async () => {
      assert.deepEqual(await mover(pedidoTransferencia, opTransferencia), transferencia);
      assert.deepEqual(await estado(), real);
      const repetido = await leitura(await estado()).loader.carregar();
      assert.deepEqual(repetido.ledger.estado, real);
      assert.equal(Modelo.construir(repetido).saldo.totalCentavos, 106250);
    });

    await t.test('resposta real sem abertura confirma ausência; resposta real de outro tenant é recusada', async () => {
      const inicial = await leitura(semAbertura).loader.carregar();
      assert.equal(inicial.ledger.status, 'confirmada'); assert.equal(Modelo.construir(inicial).saldo.status, 'sem_abertura');
      assert.equal(Modelo.construir(inicial).saldo.totalCentavos, null);
      await sessao(outroAdmin); const outroReal = await estado(); await sessao(admin);
      assert.equal(outroReal.company_id, outraEmpresa);
      const errado = await leitura(outroReal).loader.carregar();
      assert.equal(errado.ledger.status, 'indisponivel'); assert.equal(errado.ledger.estado, null);
      assert.equal(errado.dominios.recebiveis.status, 'confirmada');
      assert.equal(Modelo.construir(errado).saldo.totalCentavos, null);
      assert.equal(Modelo.construir(errado).totais.recebidoPeriodoCentavos, 462500);
    });

    await t.test('ensaio mantém sentinelas de custo/folha/estoque e saldo manual antigos intactos', async () => {
      await db.exec('reset role');
      assert.equal((await db.query('select count(*)::int n from public.caixa_operacoes')).rows[0].n, 11);
      assert.deepEqual((await db.query('select * from public.lancamentos')).rows, [{ id: 1, total: '91.23' }]);
      assert.deepEqual((await db.query('select * from public.diarias_quinzenas')).rows, [{ id: 1, status: 'fechada' }]);
      assert.deepEqual((await db.query('select * from public.distribuicoes')).rows, [{ id: 1, qtd: '7' }]);
      assert.ok((await db.query('select saldo_manual from public.companies')).rows.every(c => c.saldo_manual === '123.45'));
    });
  });
}
