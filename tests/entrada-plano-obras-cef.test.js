'use strict';
// Render CEF/helpers reais, DOM e identidade sintéticos; casos REST usam fetch real em loopback próprio, sem banco/produção.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/edr-v2-obras.js'), 'utf8');
const start = source.indexOf('function _obrasCefIdentidade()');
const end = source.indexOf('function renderObrasMateriais()', start);
assert.ok(start >= 0 && end > start, 'Usar a implementação real do CEF');
const cef = source.slice(start, end);
const company = 'cef-empresa-a', obraId = 'cef-obra-a';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function plano(total = 11000, cancelled = 500) {
  return { company_id: company, planos: [{ obra_id: obraId, plano_id: obraId, revisao: 2,
    stage: 'confirmed', original_centavos: 10000, total_centavos: total, cancelado_centavos: cancelled,
    unlinked_centavos: 0, saldo_centavos: total, pendencia_conciliacao: false,
    parcelas: [{ id: 'cef-parcela-a', label: 'Parcela de teste', due: null, method: 'A combinar', remaining: total }] }] };
}
function rep(valor, tipo = 'entrada', extra = {}) { return { obra_id: obraId, company_id: company, tipo, valor, ...extra }; }
function harness(opts = {}) {
  const original = { id: obraId, company_id: company, nome: 'Obra sintética',
    valor_venda: 1000, contrato_entrada: 100, contrato_valor: 850, contrato_subsidio: 40,
    contrato_fgts: 10, contrato_terreno: 25, contrato_taxa: '6.79', entrada_paga: false, ...opts.obra };
  const snapshots = [], reads = [];
  const el = { _html: 'DOM ATUAL', get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; snapshots.push(v); } };
  const raw = Object.hasOwn(opts, 'resumo') ? opts.resumo : plano();
  const rows = Object.hasOwn(opts, 'reps') ? opts.reps : [rep('33.33')];
  const ctx = vm.createContext({
    _companyId: company, _supabaseToken: 'SENTINELA_SINTETICA',
    usuarioAtual: { id: 'cef-ator-a', perfil: 'admin' },
    ObrasModule: { obraAberta: obraId, tab: 'cef' },
    obras: [original], obrasArquivadas: [], repassesCef: opts.globalReps || [],
    lancamentos: opts.custos || [{ obra_id: obraId, total: '800.00' }],
    document: { getElementById: id => id === 'obras-cef-content' ? el : null },
    fmt: value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value),
    fmtData: v => v, esc: value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    sbRpcEstoque: opts.rpc || (async () => ({ ok: true, dados: raw })),
    sbGetAll: async (table, query, options) => {
      reads.push({ table, query, options });
      return opts.ledger ? opts.ledger(table, query, options) : rows;
    }
  });
  if (opts.adds) ctx.AdicionaisModule = { getAdicionaisObra: () => opts.adds };
  for (const file of ['edr-v2-entrada-plano-projecoes.js', 'edr-v2-entrada-cliente.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'js', file), 'utf8'), ctx, { filename: file });
  }
  vm.runInContext(cef, ctx, { filename: 'edr-v2-obras.js:CEF' });
  const html = () => el.innerHTML.replace(/\u00a0/g, ' ');
  const text = () => html().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return { ctx, original, el, snapshots, reads, html, text, render: () => ctx.renderObraCef() };
}
function hasMoney(h, label, money) { assert.match(h.text(), new RegExp(label + '\\s*R\\$\\s*' + money.replace(/[.]/g, '\\.'))); }
function progress(h) { const m = h.html().match(/<div class="cef-progress-footer">([\s\S]*?)<\/div>/); assert.ok(m); return m[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' '); }
function noUnknownZero(h) {
  assert.match(progress(h), /Falta:\s*Indisponível/);
  assert.doesNotMatch(progress(h), /Falta:\s*R\$\s*0,00/);
}

test('CEF sem plano confirmado: carteira original e recebimentos reais, sem cadastro alterado', async () => {
  const h = harness({ resumo: { company_id: company, planos: [] } });
  const before = JSON.stringify(h.original);
  await h.render();
  hasMoney(h, 'Valor de venda original do imóvel', '1.000,00');
  assert.match(progress(h), /Recebido:\s*R\$\s*33,33/);
  assert.match(progress(h), /Falta:\s*R\$\s*966,67/);
  hasMoney(h, 'Lucro estimado vigente', '200,00');
  assert.doesNotMatch(h.text(), /Ajuste líquido aprovado|indisponíveis/);
  assert.equal(JSON.stringify(h.original), before);
  assert.equal(h.reads[0].table, 'repasses_cef');
  assert.equal(h.reads[0].options.throwOnError, true);
  assert.match(h.reads[0].query, /obra_id=eq\.cef-obra-a&order=data_credito\.desc,id$/);
});
test('CEF original100/acordo115/cancelamento5: alvo110, carteira1010, saldo976.67 e lucro210', async () => {
  const h = harness(), before = JSON.stringify(h.original);
  await h.render();
  hasMoney(h, 'Ajuste líquido aprovado:', '10,00');
  hasMoney(h, 'Carteira vigente:', '1.010,00');
  assert.match(progress(h), /Falta:\s*R\$\s*976,67/);
  hasMoney(h, 'Lucro estimado vigente', '210,00');
  hasMoney(h, 'Original', '100,00');
  hasMoney(h, 'final vigente', '110,00');
  hasMoney(h, 'Financiado', '850,00');
  assert.match(h.text(), /Dados do contrato CEF original/);
  assert.doesNotMatch(h.text(), /Soma dos componentes/);
  assert.equal(JSON.stringify(h.original), before);
});
test('CEF adicional aprovado e seus pagamentos somam uma vez; estorno real é negativo', async () => {
  const h = harness({ reps: [rep('33.33'), rep('-10.00'), rep('100.00', 'pls')],
    globalReps: [rep('9999.00')], adds: { lista: [{}], valorTotal: '50.01', totalRecebido: '20.02', saldo: 29.99 } });
  await h.render();
  assert.match(progress(h), /Recebido:\s*R\$\s*143,35/);
  assert.match(progress(h), /Falta:\s*R\$\s*916,66/);
  hasMoney(h, 'Lucro estimado vigente', '260,01');
  assert.match(h.text(), /final vigente R\$\s*110,00/);
});
test('CEF ajuste negativo aprovado mantém contrato original e reduz carteira vigente', async () => {
  const h = harness({ resumo: plano(9000, 0), reps: [] });
  await h.render();
  assert.match(h.text(), /Ajuste líquido aprovado:\s*-R\$\s*10,00/);
  hasMoney(h, 'Carteira vigente:', '990,00');
  assert.match(progress(h), /Falta:\s*R\$\s*990,00/);
  hasMoney(h, 'Lucro estimado vigente', '190,00');
  assert.equal(h.original.contrato_entrada, 100);
});
test('CEF RPC do plano rejeitado: recebido conhecido, saldo/lucro indisponíveis', async () => {
  const h = harness({ rpc: async () => ({ ok: false }) });
  await h.render();
  assert.match(h.text(), /Plano de entrada não confirmado/);
  hasMoney(h, 'Valor de venda original do imóvel', '1.000,00');
  assert.match(progress(h), /Recebido:\s*R\$\s*33,33/);
  noUnknownZero(h);
  assert.match(h.text(), /Lucro estimado vigente Indisponível/);
});
test('CEF RPC inválido ou de outro tenant não é ausência confirmada de plano', async () => {
  for (const resumo of [null, { company_id: company, planos: null }, { ...plano(), company_id: 'outra-empresa' }]) {
    const h = harness({ resumo }); await h.render(); noUnknownZero(h);
    assert.doesNotMatch(h.text(), /Carteira vigente:\s*R\$/);
  }
});
test('CEF fonte de ledger falha: valor recebido e pendente desconhecidos, carteira aprovada preservada', async () => {
  const h = harness({ ledger: async () => { throw Error('Falha sintética de REST'); }, globalReps: [rep('9999')] });
  await h.render(); noUnknownZero(h);
  assert.match(progress(h), /Recebido:\s*Indisponível/);
  assert.match(h.text(), /Recebimentos indisponíveis/);
  hasMoney(h, 'Carteira vigente:', '1.010,00');
  hasMoney(h, 'Lucro estimado vigente', '210,00');
  assert.doesNotMatch(h.html(), /class="cef-progress-fill"/);
});
test('CEF ledger inválido, sem fonte ou cross-tenant é desconhecido', async () => {
  for (const reps of [null, {}, [rep(5, 'entrada', { company_id: 'outra-empresa' })], [rep(5, 'entrada', { obra_id: 'outra-obra' })]]) {
    const h = harness({ reps }); await h.render(); noUnknownZero(h);
    assert.match(progress(h), /Recebido:\s*Indisponível/);
  }
  const h = harness(); delete h.ctx.sbGetAll; await h.render(); noUnknownZero(h);
});
test('CEF sucesso [] confirma zero real e não ressuscita ledger global antigo', async () => {
  const h = harness({ reps: [], globalReps: [rep('9999.00')] });
  await h.render();
  assert.match(progress(h), /Recebido:\s*R\$\s*0,00/);
  assert.match(progress(h), /Falta:\s*R\$\s*1\.010,00/);
  assert.doesNotMatch(h.text(), /Recebimentos indisponíveis|9\.999,00/);
});
test('CEF valores monetários inválidos/overflow nunca fabricam zero recebido', async () => {
  for (const reps of [[rep('NaN')], [rep('90071992547409.92')], [rep(null)]]) {
    const h = harness({ reps }); await h.render(); noUnknownZero(h);
    assert.match(progress(h), /Recebido:\s*Indisponível/);
  }
});
test('CEF captura id e perfil por valor: mutação do mesmo objeto durante espera não escreve DOM', async () => {
  for (const key of ['id', 'perfil']) {
    const rpc = deferred(), h = harness({ rpc: () => rpc.promise }), actor = h.ctx.usuarioAtual;
    const pending = h.render();
    actor[key] = key === 'id' ? 'cef-ator-b' : 'operacional';
    rpc.resolve({ ok: true, dados: plano() }); await pending;
    assert.equal(h.ctx.usuarioAtual, actor);
    assert.equal(h.el.innerHTML, 'DOM ATUAL'); assert.equal(h.snapshots.length, 0);
    assert.equal(h.ctx.EntradaPlanoProjecoes.atual(), null);
  }
});
test('CEF troca de empresa, token, obra ou aba durante espera não publica resposta antiga', async () => {
  for (const kind of ['empresa', 'token', 'obra', 'aba']) {
    const rpc = deferred(), h = harness({ rpc: () => rpc.promise }), pending = h.render();
    if (kind === 'empresa') { h.ctx._companyId = 'cef-empresa-b'; h.ctx.obras = []; }
    if (kind === 'token') h.ctx._supabaseToken = 'SENTINELA_B';
    if (kind === 'obra') h.ctx.ObrasModule.obraAberta = 'cef-obra-b';
    if (kind === 'aba') h.ctx.ObrasModule.tab = 'lanc';
    rpc.resolve({ ok: true, dados: plano() }); await pending;
    assert.equal(h.el.innerHTML, 'DOM ATUAL'); assert.equal(h.snapshots.length, 0);
  }
});
test('CEF duas recargas concorrentes: ledger recente vence mesmo se a leitura antiga retorna depois', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness({ ledger: () => ++calls === 1 ? first.promise : second.promise });
  const old = h.render(), fresh = h.render();
  second.resolve([rep('50.00')]); await fresh;
  assert.match(progress(h), /Falta:\s*R\$\s*960,00/);
  const latest = h.el.innerHTML;
  first.resolve([rep('1.00')]); await old;
  assert.equal(h.el.innerHTML, latest); assert.equal(h.snapshots.length, 1);
});
test('CEF não retém objeto da obra de antes da consulta e rejeita obra de outro tenant', async () => {
  const rpc = deferred(), h = harness({ rpc: () => rpc.promise }), pending = h.render();
  h.ctx.obras = [{ ...h.original, valor_venda: 2000, contrato_valor: 1850 }];
  rpc.resolve({ ok: true, dados: plano() }); await pending;
  hasMoney(h, 'Valor de venda original do imóvel', '2.000,00');
  hasMoney(h, 'Carteira vigente:', '2.010,00');
  const other = harness({ obra: { company_id: 'cef-empresa-b' } }); await other.render();
  assert.match(other.text(), /Obra não confirmada para esta empresa/);
  assert.doesNotMatch(other.text(), /1\.000,00|33,33/);
});

async function withLocalRest(handler, check) {
  const http = require('node:http');
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    assert.equal(request.method, 'GET');
    assert.equal(url.pathname, '/rest/v1/repasses_cef');
    assert.equal(url.searchParams.get('company_id'), 'eq.' + company);
    const result = handler(url);
    response.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  try { await check(origin); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}
function useRealRest(h, origin) {
  const infra = fs.readFileSync(path.join(root, 'js/edr-v2-infra.js'), 'utf8');
  const begin = infra.indexOf('async function sbGet(t,');
  const end = infra.indexOf('async function sbPost(t,', begin);
  assert.ok(begin >= 0 && end > begin, 'Usar sbGet e sbGetAll reais de Infra');
  Object.assign(h.ctx, {
    SUPABASE_URL: origin, _TABELAS_TENANT: new Set(['repasses_cef']),
    _sbHeaders: () => ({ 'Content-Type': 'application/json' }),
    fetch: (url, options) => {
      assert.equal(new URL(url).origin, origin, 'Nenhuma conexão fora do servidor loopback deste teste');
      return fetch(url, { ...options, redirect: 'error' });
    }, console: { warn: () => {} }
  });
  vm.runInContext(infra.slice(begin, end), h.ctx, { filename: 'edr-v2-infra.js:sbGet/sbGetAll' });
}
test('CEF REST real HTTP200 objeto: leitor estrito rejeita; fallback legado é mantido', async () => {
  await withLocalRest(() => ({ body: { error: 'Resposta sintética sem array' } }), async origin => {
    const h = harness({ globalReps: [rep('9999.00')] }); useRealRest(h, origin);
    await assert.rejects(h.ctx.sbGetAll('repasses_cef', '', { throwOnError: true }), /sbGetAll resposta inválida/);
    assert.equal((await h.ctx.sbGetAll('repasses_cef')).length, 0);
    await h.render(); noUnknownZero(h);
    assert.match(progress(h), /Recebido:\s*Indisponível/);
    assert.match(h.text(), /Recebimentos indisponíveis/);
  });
});
test('CEF REST real falha após página válida: saldo desconhecido, sem total parcial confirmado', async () => {
  const first = Array.from({ length: 1000 }, (_, i) => ({ ...rep('0.01'), id: 'cef-repasse-' + i }));
  for (const failure of [{ status: 503, body: { message: 'Falha sintética posterior' } }, { body: { message: 'Página sintética inválida' } }]) {
    const offsets = [];
    await withLocalRest(url => {
      const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
      return offset === 0 ? { body: first } : failure;
    }, async origin => {
      const h = harness(); useRealRest(h, origin);
      await h.render(); noUnknownZero(h);
      assert.match(progress(h), /Recebido:\s*Indisponível/);
      assert.doesNotMatch(progress(h), /Recebido:\s*R\$\s*10,00/);
      assert.deepEqual(offsets, [0, 1000]);
    });
  }
});
test('CEF REST real [] confirma zero; duas páginas válidas confirmam o recebido uma vez', async () => {
  await withLocalRest(() => ({ body: [] }), async origin => {
    const h = harness({ globalReps: [rep('9999.00')] }); useRealRest(h, origin);
    await h.render();
    assert.match(progress(h), /Recebido:\s*R\$\s*0,00/);
    assert.match(progress(h), /Falta:\s*R\$\s*1\.010,00/);
  });
  const first = Array.from({ length: 1000 }, (_, i) => ({ ...rep('0.01'), id: 'cef-repasse-' + i }));
  const offsets = [];
  await withLocalRest(url => {
    const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
    return { body: offset === 0 ? first : [{ ...rep('0.25'), id: 'cef-repasse-final' }] };
  }, async origin => {
    const h = harness(); useRealRest(h, origin);
    await h.render();
    assert.match(progress(h), /Recebido:\s*R\$\s*10,25/);
    assert.match(progress(h), /Falta:\s*R\$\s*999,75/);
    assert.deepEqual(offsets, [0, 1000]);
  });
});
