/* ═══════════════════════════════════════════════════════════════════════════
   EDR — AMORTIZAÇÃO DE CONTRATO · UI (V1 local)
   ───────────────────────────────────────────────────────────────────────────
   CORREÇÃO DE DIREÇÃO (2026-07-30): este módulo NÃO simula novo financiamento.
   Ele calcula o impacto de uma amortização extraordinária sobre um contrato
   QUE JÁ ESTÁ RODANDO.

   REGRA CENTRAL — NÃO VIOLAR:
   `obras.contrato_valor` é o VALOR ORIGINAL FINANCIADO. NUNCA é saldo devedor
   atual. Nenhum cálculo de impacto (economia, novo prazo, nova parcela) pode
   partir dele. O saldo atual vem do EXTRATO, digitado pelo usuário.

   Os campos `contrato_*` servem SOMENTE como sugestão visual de dados de
   origem — nunca são regravados, nunca substituem dado do extrato.

   NÃO implementar nesta V1: dedução de saldo por "parcelas pagas" ou por
   "data da 1ª parcela". Depende de histórico real, atrasos, indexadores e
   condições contratuais que o EDR não possui.

   Estado local: nada persiste. Sem sbGet/sbPost/sbPatch/sbDelete.
   XSS: padrão innerHTML do EDR; todo conteúdo dinâmico passa por esc(), e
   valores monetários/datas vêm formatados do motor (BigInt -> texto).
   ═══════════════════════════════════════════════════════════════════════════ */

const SimuladorModule = {
  obraId: '',
  contratoOrigem: null,        // snapshot de contrato_* SÓ para exibição
  lancamentos: [],             // amortizações registradas na sessão
  modalidadeEscolhida: 'reduzir_prazo',
  _seq: 1
};

const _SIM_RESSALVA = 'Projeção gerencial; condições efetivas dependem da análise e proposta da instituição financeira.';
const _SIM_BLOQUEIO = 'Informe os dados atuais do contrato conforme o extrato. O valor original financiado não representa o saldo devedor atual.';
const _SIM_BLOQUEIO_DATA = 'A amortização desta projeção é aplicada na mesma data do saldo informado no extrato. A V1 não calcula pró-rata nem indexadores.';
const _SIM_NOTA_DATA = 'A amortização desta projeção é aplicada na mesma data do saldo informado no extrato.';

// ── Moeda: texto BR -> BigInt centavos (string ops, sem float em moeda) ─────
function _simParseMoeda(txt) {
  if (typeof txt !== 'string') return null;
  const s = txt.trim().replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.');
  if (s === '' || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, frac = ''] = s.split('.');
  return BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
}
function _simFmt(cent) { return 'R$ ' + SimuladorCalc.centavosParaTexto(cent); }
function _simNumParaMoedaTxt(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [i, f = ''] = s.split('.');
  return i + ',' + (f + '00').slice(0, 2);
}
/* Texto de origem de `contrato_taxa` / `contrato_prazo`, exibido como veio do
   cadastro. Campo livre: o usuário pode ter digitado "7,95", "7,95%" ou
   "10,47% a.a.". Concatenar sufixo produzia "7,95%% a.a." — por isso nada é
   acrescentado aqui. APENAS exibição; nunca vira entrada de cálculo. */
function _simTaxaOrigemTexto(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function _simPrazoOrigemTexto(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
/* ── AUTOCOMPLETE DE OBRA: rótulo é identificador, não só nome ──────────────
   `<datalist>` devolve texto, não id. Se duas obras tiverem o mesmo nome,
   resolver pelo nome escolheria a primeira encontrada — e o cálculo sairia
   para a obra errada, em silêncio. Por isso o rótulo de nomes repetidos ganha
   o id, e texto ambíguo NÃO seleciona nada. Achado da auditoria 2026-08-03. */
function _simRotuloObra(obra, lista) {
  const nome = String(obra.nome || '').trim();
  const homonimas = (lista || []).filter(function (o) {
    return String(o.nome || '').trim().toLowerCase() === nome.toLowerCase();
  });
  return homonimas.length > 1 ? nome + ' (#' + obra.id + ')' : nome;
}

/* Devolve o id da obra correspondente ao texto, ou '' quando não há
   correspondência única. Ambíguo e inexistente têm o mesmo tratamento:
   nenhuma obra selecionada. */
function _simResolverObra(texto, lista) {
  const alvo = String(texto || '').trim().toLowerCase();
  if (alvo === '') return '';
  const obras_ = (lista || []);

  // 1) Rótulo exato (já desambiguado quando havia homônimas).
  const porRotulo = obras_.filter(function (o) {
    return _simRotuloObra(o, obras_).toLowerCase() === alvo;
  });
  if (porRotulo.length === 1) return String(porRotulo[0].id);

  // 2) Nome cru: só resolve se for único. Ambíguo devolve '' de propósito.
  const porNome = obras_.filter(function (o) {
    return String(o.nome || '').trim().toLowerCase() === alvo;
  });
  return porNome.length === 1 ? String(porNome[0].id) : '';
}

// Exibição do painel de origem: usa o formatador do motor (separador de milhar).
// Continua sendo APENAS exibição — não produz valor de cálculo.
function _simNumParaExibicao(v) {
  const txt = _simNumParaMoedaTxt(v);
  if (txt === null) return null;
  const cent = _simParseMoeda(txt);
  return cent === null ? txt : SimuladorCalc.centavosParaTexto(cent);
}

/* ── VALIDAÇÃO DOS DADOS DO EXTRATO ────────────────────────────────────────
   Fonte única de verdade para liberar/bloquear a prévia. Testável sem DOM.
   Retorna { ok, erros[], dados{} }. Nunca lê contrato_* aqui. */
function _simValidarExtrato(entrada) {
  const erros = [];
  const d = {};

  const saldo = (typeof entrada.saldoAtualTxt === 'string')
    ? _simParseMoeda(entrada.saldoAtualTxt) : null;
  if (saldo === null || saldo <= 0n) erros.push('saldo devedor atual (conforme extrato)');
  else d.saldoCent = saldo;

  // Regex sozinha aceita 2026-02-31. parseDataISO valida o calendário real.
  if (!entrada.dataReferencia) {
    erros.push('data de referência do saldo');
  } else {
    try {
      SimuladorCalc.parseDataISO(entrada.dataReferencia);
      d.dataReferencia = entrada.dataReferencia;
    } catch (e) {
      erros.push('data de referência do saldo');
    }
  }

  const taxaTxt = String(entrada.taxaMensalTxt || '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(taxaTxt) || parseFloat(taxaTxt) < 0 || parseFloat(taxaTxt) > 100) {
    erros.push('taxa mensal efetiva do contrato');
  } else {
    try { d.taxaMensalPpb = SimuladorTaxa.mensalParaPpb(parseFloat(taxaTxt) / 100); }
    catch (e) { erros.push('taxa mensal efetiva do contrato'); }
  }

  const prazo = parseInt(entrada.prazoRemanescente, 10);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 480) {
    erros.push('prazo remanescente em meses');
  } else d.prazoMeses = prazo;

  if (entrada.sistema !== 'SAC' && entrada.sistema !== 'PRICE') {
    erros.push('sistema (SAC ou Price)');
  } else d.sistema = entrada.sistema;

  return { ok: erros.length === 0, erros, dados: d };
}

/* Calcula o impacto nas DUAS modalidades a partir do saldo do extrato.
   Lança se os dados do extrato não estiverem válidos — nunca cai em contrato_*.

   REGRA TEMPORAL DA V1 (auditoria 2026-08-03):
   `dataReferencia` é a DATA DE CORTE — a posição do saldo no extrato. A
   amortização ocorre obrigatoriamente nela, e a 1ª parcela projetada vence um
   mês depois. Amortizar em data intermediária exigiria pró-rata e indexador,
   que a V1 não calcula; por isso é bloqueado em vez de aproximado. */
function _simCalcularImpacto(extrato, amortizacao) {
  const v = _simValidarExtrato(extrato);
  if (!v.ok) {
    const e = new Error(_SIM_BLOQUEIO);
    e.codigo = 'EXTRATO_INCOMPLETO';
    e.faltando = v.erros;
    throw e;
  }

  const dataCorte = v.dados.dataReferencia;
  if (amortizacao.dataAmortizacao !== dataCorte) {
    const e = new Error(_SIM_BLOQUEIO_DATA);
    e.codigo = 'DATA_AMORT_FORA_DO_CORTE';
    e.dataCorte = dataCorte;
    e.dataInformada = amortizacao.dataAmortizacao;
    throw e;
  }

  // 1ª parcela projetada = um mês após a data de corte.
  const primeiraParcela = SimuladorCalc.formatarDataISO(
    SimuladorCalc.somarMeses(SimuladorCalc.parseDataISO(dataCorte), 1));

  const base = {
    saldoCent: v.dados.saldoCent,
    taxaMensalPpb: v.dados.taxaMensalPpb,
    prazoMeses: v.dados.prazoMeses,
    sistema: v.dados.sistema,
    dataPrimeiraParcela: primeiraParcela,
    dataBase: dataCorte            // piso: nenhum evento antes do corte
  };
  const semAmort = SimuladorCalc.gerarTabela(base);
  const out = { base: semAmort, efeitos: {} };

  for (const mod of ['reduzir_prazo', 'reduzir_prestacao']) {
    try {
      const r = SimuladorCalc.simular({
        ...base,
        amortizacoes: [{ id: '__calc__', dataAplicacao: amortizacao.dataAmortizacao,
                         sequencia: 1, valorCent: amortizacao.valorCent, modalidade: mod }]
      });
      const snap = r.snapshots.find(s => s.eventoId === '__calc__');
      out.efeitos[mod] = {
        ok: true,
        prazoAntes: semAmort.prazoEfetivo,
        prazoDepois: r.prazoEfetivo,
        parcelasReduzidas: semAmort.prazoEfetivo - r.prazoEfetivo,
        parcelaAntesCent: snap ? snap.parcelaAntesCent : semAmort.linhas[0].parcelaCent,
        parcelaDepoisCent: snap ? snap.parcelaDepoisCent : 0n,
        jurosEconomizadosCent: semAmort.totalJurosCent - r.totalJurosCent,
        resultado: r
      };
    } catch (e) {
      out.efeitos[mod] = { ok: false, erro: e.message || String(e), codigo: e.codigo || null };
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CAMADA DE APRESENTAÇÃO
   Layout de referência aprovado pelo Duam (2026-07-30): painel de origem
   somente-leitura, bloco de dados do extrato, cards de efeito lado a lado
   com escolha por radio. Paleta e classes do EDR, sem cores novas.
   Números vêm exclusivamente do motor testado — nada é estimado na UI.

   XSS: mesmo padrao dos demais modulos do EDR (montagem de string + esc()).
   Todo dado dinamico passa por esc(); moeda e datas vem formatadas do motor.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── CSS DO MÓDULO ────────────────────────────────────────────────────────────
   Escopo restrito a `#view-simulador`: nenhum estilo global do EDR é alterado.
   Usa os componentes reais do design system (.card/.card-header/.card-body,
   .field como WRAPPER, .btn .btn-primary, .btn-secondary) e acrescenta só o
   que falta — 44px de alvo de toque e a hierarquia da tela.

   Auditoria 2026-08-03: a versão anterior usava `dist-form-input`, `btn-pri` e
   `btn-sec`, que NÃO EXISTEM no design system — daí os controles nativos, com
   19px de altura em 375px. */
const _SIM_CSS = `
#view-simulador{max-width:1040px;margin:0 auto;padding:4px 0 40px}

/* Faixa de status: discreta, não compete com o conteúdo */
#view-simulador .sim-status{display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  font-size:12px;color:var(--text-secondary);background:var(--bg);
  border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:8px 12px;margin-bottom:8px}
#view-simulador .sim-status b{color:var(--text-primary);font-weight:600}
#view-simulador .sim-status .sim-dot{width:6px;height:6px;border-radius:50%;
  background:var(--warning);flex:0 0 auto}

/* Ressalva financeira: obrigatória e comercialmente sensível — discreta, mas
   legível. Callout com texto em contraste primário, junto ao título. */
#view-simulador .sim-ressalva{display:flex;gap:9px;align-items:flex-start;
  font-size:13px;line-height:1.5;color:var(--text-primary);
  background:rgba(217,119,6,.07);border:1px solid rgba(217,119,6,.28);
  border-radius:var(--radius-sm);padding:11px 14px;margin:0 0 22px}
#view-simulador .sim-ressalva::before{content:'!';flex:0 0 auto;
  width:17px;height:17px;margin-top:1px;border-radius:50%;
  background:var(--warning);color:#fff;font-size:11px;font-weight:800;
  display:grid;place-items:center;line-height:1}

#view-simulador h2.sim-titulo{font-family:'Plus Jakarta Sans',sans-serif;
  font-size:20px;font-weight:800;color:var(--text-primary);margin:0 0 4px}
#view-simulador .sim-sub{font-size:13px;color:var(--text-secondary);margin:0 0 18px}

/* Passos numerados */
#view-simulador .card{margin-bottom:16px}
#view-simulador .sim-passo{display:flex;align-items:center;gap:10px}
#view-simulador .sim-num{width:22px;height:22px;border-radius:50%;flex:0 0 auto;
  background:var(--primary-light);color:var(--primary-hover);
  font-size:11px;font-weight:700;display:grid;place-items:center}
#view-simulador .sim-ajuda{font-size:12px;color:var(--text-secondary);
  margin:-4px 0 16px;line-height:1.5}

/* Campos — .field é WRAPPER; 44px garante toque confortável */
#view-simulador .sim-grid{display:grid;gap:14px;
  grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}

/* Etapa 2: 5 campos. Em auto-fit o 5º ficava órfão numa 2ª linha, com vazio
   grande ao lado. Grade explícita de 6 colunas: saldo ocupa o dobro (é o
   protagonista) e os 4 restantes fecham as duas linhas sem sobra. */
#view-simulador .sim-grid-extrato{display:grid;gap:14px;
  grid-template-columns:repeat(6,1fr)}
#view-simulador .sim-grid-extrato > .field{grid-column:span 2}
#view-simulador .sim-grid-extrato > .field:first-child{grid-column:span 4}
@media(max-width:980px){
  #view-simulador .sim-grid-extrato{grid-template-columns:repeat(4,1fr)}
  #view-simulador .sim-grid-extrato > .field:first-child{grid-column:span 4}
  #view-simulador .sim-grid-extrato > .field{grid-column:span 2}
}
#view-simulador .field{margin-bottom:0}
#view-simulador .field input,
#view-simulador .field select{min-height:44px;font-size:15px}
#view-simulador .btn,
#view-simulador .btn-secondary{min-height:44px}
#view-simulador .field .sim-req{color:var(--error);margin-left:2px}
#view-simulador .field .sim-dica{font-size:11px;color:var(--text-tertiary);
  margin-top:5px;line-height:1.45}

/* Campo protagonista: saldo do extrato e valor a amortizar */
#view-simulador .field.sim-forte label{color:var(--text-primary);font-size:12px}
#view-simulador .field.sim-forte input{font-size:19px;font-weight:700;min-height:52px;
  font-family:'Space Grotesk',monospace}
/* Secundários: visíveis, com peso reduzido */
#view-simulador .field.sim-fraco label{opacity:.8}
#view-simulador .field.sim-fraco input,
#view-simulador .field.sim-fraco select{font-size:14px;color:var(--text-secondary)}

/* Painel de origem — somente leitura */
#view-simulador .sim-origem{display:grid;gap:10px;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
#view-simulador .sim-ob{background:var(--bg);border:1px solid var(--border);
  border-radius:var(--radius-sm);padding:10px 12px}
#view-simulador .sim-ob.sim-alerta{border-color:var(--warning);
  background:rgba(217,119,6,.06)}
#view-simulador .sim-ob-rot{font-size:10px;font-weight:700;letter-spacing:.5px;
  text-transform:uppercase;color:var(--text-tertiary);margin-bottom:4px}
#view-simulador .sim-ob-val{font-size:14px;font-weight:600;color:var(--text-primary);
  font-family:'Space Grotesk',monospace}
#view-simulador .sim-aviso-origem{margin-top:12px;font-size:12px;line-height:1.5;
  color:var(--text-secondary);background:rgba(217,119,6,.07);
  border-left:3px solid var(--warning);border-radius:0 6px 6px 0;padding:10px 12px}

/* Estado vazio orientativo — substitui o alerta laranja de rodapé */
#view-simulador .sim-vazio{border:1px dashed var(--border);border-radius:var(--radius-md);
  padding:28px 20px;text-align:center;color:var(--text-secondary)}
#view-simulador .sim-vazio-t{font-size:14px;font-weight:600;
  color:var(--text-primary);margin-bottom:6px}
#view-simulador .sim-vazio-l{display:inline-flex;flex-direction:column;gap:4px;
  text-align:left;margin-top:12px;font-size:12.5px}
#view-simulador .sim-vazio-l span::before{content:'○ ';color:var(--warning)}

/* Comparação — EMPILHADOS em 375px, nunca rolagem horizontal */
#view-simulador .sim-efeitos{display:grid;gap:14px;grid-template-columns:1fr 1fr}
#view-simulador .sim-ef{border:1.5px solid var(--border);border-radius:var(--radius-md);
  padding:18px;cursor:pointer;background:var(--card);
  transition:border-color .15s,box-shadow .15s}
#view-simulador .sim-ef:hover{border-color:var(--text-tertiary)}
#view-simulador .sim-ef:focus-visible{outline:2px solid var(--primary);
  outline-offset:2px;border-color:var(--primary)}
#view-simulador .sim-ef.sel{border-color:var(--primary);
  box-shadow:0 0 0 3px var(--primary-surface)}
#view-simulador .sim-ef-top{display:flex;align-items:center;justify-content:space-between;
  gap:8px;margin-bottom:14px}
#view-simulador .sim-ef-nome{font-size:13px;font-weight:700;color:var(--text-primary)}
#view-simulador .sim-radio{width:18px;height:18px;border-radius:50%;flex:0 0 auto;
  border:2px solid var(--border);display:grid;place-items:center}
#view-simulador .sim-ef.sel .sim-radio{border-color:var(--primary)}
#view-simulador .sim-ef.sel .sim-radio::after{content:'';width:8px;height:8px;
  border-radius:50%;background:var(--primary)}
#view-simulador .sim-ef-rot{font-size:11px;font-weight:600;letter-spacing:.4px;
  text-transform:uppercase;color:var(--text-tertiary);margin-bottom:2px}
#view-simulador .sim-ef-big{font-family:'Space Grotesk',monospace;font-size:30px;
  font-weight:700;line-height:1.1;color:var(--text-primary);letter-spacing:-.5px}
#view-simulador .sim-ef-mid{font-family:'Space Grotesk',monospace;font-size:16px;
  font-weight:600;color:var(--text-primary)}
#view-simulador .sim-ef-sep{border-top:1px solid var(--border-light);margin:14px 0 10px}
#view-simulador .sim-ef-obs{font-size:12px;color:var(--text-secondary);line-height:1.5}
#view-simulador .sim-eco{margin-top:14px;background:var(--primary-surface);
  border:1px solid var(--primary-light);border-radius:var(--radius-sm);
  padding:10px 12px;font-size:12px;color:var(--primary-hover)}
#view-simulador .sim-eco b{font-family:'Space Grotesk',monospace;font-size:15px;
  display:block;margin-top:2px}

#view-simulador .sim-acoes{display:flex;gap:10px;justify-content:flex-end;
  flex-wrap:wrap;margin:18px 0 24px}

/* Lançamentos da sessão */
#view-simulador .sim-lanc{border:1px solid var(--border);border-radius:var(--radius-sm);
  padding:12px 14px;margin-bottom:8px;font-size:13px;background:var(--card)}

/* AREA SEGURA INFERIOR (mobile)
   O shell tem .bnav fixo de 64px no rodape. Sem folga, focar um campo do fim do
   card o deixa VISUALMENTE coberto: medido em 375x812, sim-dataref ficava 16px
   sob a barra e sim-am-valor 9px. scroll-margin-bottom faz o navegador parar a
   rolagem acima dela ao focar; o padding impede que o ultimo card encoste.
   Achado da revisao do Codex, 2026-08-03. */
@media(max-width:900px){
  #view-simulador{padding-bottom:calc(64px + env(safe-area-inset-bottom, 0px) + 24px)}
  #view-simulador input,
  #view-simulador select,
  #view-simulador button,
  #view-simulador .sim-ef{scroll-margin-bottom:96px}
}

@media(max-width:720px){
  #view-simulador .sim-efeitos{grid-template-columns:1fr}   /* empilha, sem rolagem */
  #view-simulador .sim-grid{grid-template-columns:1fr}
  #view-simulador .sim-grid-extrato{grid-template-columns:1fr}
  #view-simulador .sim-grid-extrato > .field,
  #view-simulador .sim-grid-extrato > .field:first-child{grid-column:auto}
  #view-simulador .card-header{padding:14px 16px}
  #view-simulador .card-body{padding:16px}
  #view-simulador .sim-ef-big{font-size:26px}
  #view-simulador .sim-acoes .btn,
  #view-simulador .sim-acoes .btn-secondary{flex:1 1 auto;justify-content:center}
}
`;

function _simInjetarCSS() {
  if (document.getElementById('sim-css')) return;
  const st = document.createElement('style');
  st.id = 'sim-css';
  st.textContent = _SIM_CSS;
  document.head.appendChild(st);
}

// Escreve HTML ja montado e escapado no elemento alvo.
function _simPintar(el, html) {
  if (el) el.innerHTML = html;
}

function renderSimulador() {
  const container = document.getElementById('view-simulador');
  if (!container) return;
  _simPintar(container, _simBuildPagina());
  _simAtualizarPrevia();
  _simRenderLancamentos();
}

/* Ressalva financeira — legível, sem competir com o conteúdo. Texto obrigatório
   e não removível (ver spec §1). */
function _simRessalvaHTML() {
  return '<p class="sim-ressalva">' + esc(_SIM_RESSALVA) + '</p>';
}

/* Faixa de status — discreta. Continua declarando que nada persiste. */
function _simBadgeLocal() {
  return '<div class="sim-status"><span class="sim-dot"></span>' +
    '<span><b>Memória da sessão</b> — os lançamentos desta tela não são gravados ' +
    'em banco e somem ao recarregar.</span></div>';
}

// Caixa somente-leitura do painel de origem (dado do cadastro, nunca de cálculo).
function _simBoxOrigem(rotulo, valor, destaque) {
  return '<div class="sim-ob' + (destaque ? ' sim-alerta' : '') + '">' +
    '<div class="sim-ob-rot">' + esc(rotulo) + '</div>' +
    '<div class="sim-ob-val">' + esc(valor) + '</div></div>';
}

// Cabeçalho de card com número do passo.
function _simCardHead(n, titulo) {
  return '<div class="card-header"><div class="sim-passo">' +
    '<span class="sim-num">' + n + '</span>' +
    '<span class="card-title">' + esc(titulo) + '</span></div></div>';
}

// Campo do design system: .field é WRAPPER, não classe do input.
function _simCampo(id, rotulo, opt) {
  const o = opt || {};
  const cls = 'field' + (o.forte ? ' sim-forte' : '') + (o.fraco ? ' sim-fraco' : '');
  const req = o.obrigatorio ? '<span class="sim-req">*</span>' : '';
  const dica = o.dica ? '<div class="sim-dica">' + o.dica + '</div>' : '';
  let campo;
  if (o.opcoes) {
    campo = '<select id="' + id + '" onchange="' + (o.evento || '_simAtualizarPrevia()') + '">' +
      o.opcoes + '</select>';
  } else {
    campo = '<input id="' + id + '"' +
      (o.tipo ? ' type="' + o.tipo + '"' : '') +
      (o.lista ? ' list="' + o.lista + '" autocomplete="off"' : '') +
      (o.valor != null ? ' value="' + esc(o.valor) + '"' : '') +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      (o.somenteLeitura ? ' readonly tabindex="-1"' : '') +
      ' ' + (o.tipo === 'date' ? 'onchange' : 'oninput') + '="' +
      (o.evento || '_simAtualizarPrevia()') + '"/>';
  }
  return '<div class="' + cls + '"><label for="' + id + '">' + esc(rotulo) + req + '</label>' +
    campo + dica + '</div>';
}

function _simBuildPagina() {
  _simInjetarCSS();
  const obrasLista = (typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [];
  // Autocomplete nativo (input + datalist): lista grande não vira select com
  // rolagem, e o valor digitado sobrevive a um repovoamento da lista.
  // Rótulo desambiguado: obras homônimas recebem o id.
  const opts = obrasLista.map(function (o) {
    return '<option value="' + esc(_simRotuloObra(o, obrasLista)) + '"></option>';
  }).join('');
  const obraAtual = obrasLista.find(function (o) {
    return String(o.id) === SimuladorModule.obraId;
  });

  return '' +
    _simBadgeLocal() +
    '<h2 class="sim-titulo">Amortização de Contrato</h2>' +
    '<p class="sim-sub">Quanto uma amortização extraordinária muda o seu ' +
      'financiamento em andamento.</p>' +
    _simRessalvaHTML() +

    // ── 1. Obra ────────────────────────────────────────────────────────────
    '<section class="card">' +
      _simCardHead(1, 'Selecionar a obra') +
      '<div class="card-body">' +
        _simCampo('sim-obra', 'Obra', {
          lista: 'sim-obra-lista',
          valor: obraAtual ? _simRotuloObra(obraAtual, obrasLista) : '',
          placeholder: 'digite para buscar',
          evento: '_simTrocarObra()'
        }) +
        '<datalist id="sim-obra-lista">' + opts + '</datalist>' +
        '<div id="sim-origem"></div>' +
      '</div>' +
    '</section>' +

    // ── 2. Extrato ─────────────────────────────────────────────────────────
    '<section class="card">' +
      _simCardHead(2, 'Posição do contrato, conforme o extrato') +
      '<div class="card-body">' +
        '<p class="sim-ajuda">Copie do extrato da instituição financeira. O valor ' +
          'original financiado do cadastro <strong>não serve</strong> aqui.</p>' +
        '<div class="sim-grid sim-grid-extrato">' +
          _simCampo('sim-saldo', 'Saldo devedor atual', {
            forte: true, obrigatorio: true, placeholder: 'R$ 0,00',
            dica: 'Quanto você ainda deve hoje, conforme o extrato.'
          }) +
          _simCampo('sim-dataref', 'Data do extrato', {
            tipo: 'date', obrigatorio: true,
            dica: 'A projeção parte desta data.'
          }) +
          _simCampo('sim-taxa', 'Taxa mensal efetiva (%)', {
            fraco: true, obrigatorio: true, placeholder: '0,832834',
            dica: '<span id="sim-taxa-dica"></span>'
          }) +
          _simCampo('sim-prazo', 'Prazo remanescente (meses)', {
            fraco: true, obrigatorio: true, placeholder: '0'
          }) +
          _simCampo('sim-sistema', 'Sistema de amortização', {
            fraco: true, obrigatorio: true,
            opcoes: '<option value="">selecione</option>' +
                    '<option value="SAC">SAC</option><option value="PRICE">Price</option>'
          }) +
        '</div>' +
      '</div>' +
    '</section>' +

    // ── 3. Amortização ─────────────────────────────────────────────────────
    '<section class="card">' +
      _simCardHead(3, 'Quanto você quer amortizar') +
      '<div class="card-body">' +
        '<div class="sim-grid">' +
          _simCampo('sim-am-valor', 'Valor a amortizar', {
            forte: true, placeholder: 'R$ 0,00',
            dica: 'Valor extra que você vai abater do saldo.'
          }) +
          // V1: a data da amortização É a data de corte. Campo espelho, só leitura.
          _simCampo('sim-am-data', 'Data da amortização', {
            tipo: 'date', fraco: true, somenteLeitura: true,
            dica: esc(_SIM_NOTA_DATA)
          }) +
        '</div>' +
      '</div>' +
    '</section>' +

    // ── 4. Decisão ─────────────────────────────────────────────────────────
    '<div id="sim-previa"></div>' +
    '<div id="sim-lancamentos"></div>';
}

// Painel de origem: referência do contrato assinado. NUNCA preenche campo de cálculo.
function _simTrocarObra() {
  // O autocomplete devolve TEXTO; o id sai de _simResolverObra, que exige
  // correspondência única. Texto ambíguo ou desconhecido -> nenhuma obra.
  const campo = document.getElementById('sim-obra');
  const lista = (typeof obras !== 'undefined' && Array.isArray(obras)) ? obras : [];
  SimuladorModule.obraId = _simResolverObra(campo ? campo.value : '', lista);
  const obra = lista.find(function (o) {
    return String(o.id) === SimuladorModule.obraId;
  });
  const box = document.getElementById('sim-origem');
  const dica = document.getElementById('sim-taxa-dica');
  if (!box) return;

  if (!obra) {
    _simPintar(box, '');
    if (dica) dica.textContent = '';
    SimuladorModule.contratoOrigem = null;
    _simAtualizarPrevia();
    return;
  }

  SimuladorModule.contratoOrigem = {
    nome: obra.nome,
    valorOriginal: _simNumParaExibicao(obra.contrato_valor),
    entrada: _simNumParaExibicao(obra.contrato_entrada),
    subsidio: _simNumParaExibicao(obra.contrato_subsidio),
    fgts: _simNumParaExibicao(obra.contrato_fgts),
    total: _simNumParaExibicao(obra.valor_venda),
    taxaTexto: _simTaxaOrigemTexto(obra.contrato_taxa),
    prazoTexto: _simPrazoOrigemTexto(obra.contrato_prazo),
    dataTexto: obra.contrato_data || null
  };
  const c = SimuladorModule.contratoOrigem;

  const linha1 =
    _simBoxOrigem('Valor ORIGINAL financiado', c.valorOriginal ? 'R$ ' + c.valorOriginal : '—', true) +
    // Texto do cadastro exibido como veio — sem acrescentar "%" nem "a.a.".
    _simBoxOrigem('Taxa no cadastro', c.taxaTexto || '—') +
    _simBoxOrigem('Prazo no cadastro', c.prazoTexto || '—');
  const linha2 =
    _simBoxOrigem('Entrada', c.entrada ? 'R$ ' + c.entrada : 'R$ 0,00') +
    _simBoxOrigem('Subsídio', c.subsidio ? 'R$ ' + c.subsidio : 'R$ 0,00') +
    _simBoxOrigem('FGTS', c.fgts ? 'R$ ' + c.fgts : 'R$ 0,00') +
    _simBoxOrigem('Valor total do imóvel', c.total ? 'R$ ' + c.total : '—');

  _simPintar(box,
    '<div class="sim-ob-rot" style="margin:14px 0 8px;">Contrato assinado — apenas referência</div>' +
    '<div class="sim-origem" style="margin-bottom:10px;">' + linha1 + '</div>' +
    '<div class="sim-origem">' + linha2 + '</div>' +
    '<div class="sim-aviso-origem">O valor original financiado ' +
      '<strong>não é o saldo devedor atual</strong>. Informe o saldo conforme o extrato, ' +
      'no passo 2.</div>');

  // Conversão da taxa do cadastro: informativa. NÃO preenche o campo de cálculo.
  if (dica) {
    const t = SimuladorTaxa.interpretarTextoTaxa(c.taxaTexto || '');
    if (t !== null) {
      const ppb = SimuladorTaxa.anualParaMensalPpb(t);
      // c.taxaTexto vem do cadastro como o usuário digitou (pode já ter "%").
      dica.textContent = 'Cadastro: ' + c.taxaTexto + ' equivale a ' +
        SimuladorTaxa.ppbParaTextoMensal(ppb, 6) + ' a.m. — confira no extrato.';
    } else {
      dica.textContent = '';
    }
  }
  _simAtualizarPrevia();
}

function _simLerFormulario() {
  const g = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
  const dataRef = g('sim-dataref');

  // V1: a amortização ocorre na data de corte. O campo de data é espelho,
  // sincronizado aqui — nunca fonte independente.
  const campoData = document.getElementById('sim-am-data');
  if (campoData && campoData.value !== dataRef) campoData.value = dataRef;

  return {
    extrato: {
      saldoAtualTxt: g('sim-saldo'),
      dataReferencia: dataRef,
      taxaMensalTxt: g('sim-taxa'),
      prazoRemanescente: g('sim-prazo'),
      sistema: g('sim-sistema')
    },
    valorTxt: g('sim-am-valor'),
    dataAmortizacao: dataRef,
    modalidade: SimuladorModule.modalidadeEscolhida || 'reduzir_prazo'
  };
}

// Card de efeito: número grande, economia em destaque, escolha inequívoca.
function _simCardEfeito(mod, ef, selecionado) {
  const titulo = mod === 'reduzir_prazo' ? 'Reduzir prazo' : 'Reduzir prestação';

  if (!ef.ok) {
    return '<div class="sim-ef" style="opacity:.55;cursor:default;">' +
      '<div class="sim-ef-top"><span class="sim-ef-nome">' + titulo + '</span></div>' +
      '<div style="color:var(--error);font-size:12.5px;">Não aplicável — ' +
      esc(ef.erro) + '</div></div>';
  }

  const corpo = (mod === 'reduzir_prazo')
    ? '<div class="sim-ef-rot">Novo prazo</div>' +
      '<div class="sim-ef-big">' + ef.prazoDepois +
        ' <span style="font-size:13px;font-weight:500;color:var(--text-secondary);">meses</span></div>' +
      '<div class="sim-ef-sep"></div>' +
      '<div class="sim-ef-obs">Parcela segue <strong>' + _simFmt(ef.parcelaAntesCent) +
        '</strong><br>Você deixa de pagar <strong>' + ef.parcelasReduzidas +
        '</strong> parcelas</div>'
    : '<div class="sim-ef-rot">Nova parcela</div>' +
      '<div class="sim-ef-big">' + _simFmt(ef.parcelaDepoisCent) + '</div>' +
      '<div class="sim-ef-sep"></div>' +
      '<div class="sim-ef-obs">Você passa a pagar <strong>' +
        _simFmt(ef.parcelaAntesCent - ef.parcelaDepoisCent) + '</strong> a menos por mês' +
        '<br>Prazo segue <strong>' + ef.prazoDepois + ' meses</strong></div>';

  /* Nome acessivel EXPLICITO: sem aria-label o leitor de tela le o texto inteiro
     do card grudado ("Reduzir prazoNovo prazo412 mesesParcela segue R$..."),
     porque o nome acessivel cai no textContent. Achado da auditoria 2026-08-03. */
  const resumo = (mod === 'reduzir_prazo')
    ? titulo + ': novo prazo de ' + ef.prazoDepois + ' meses, ' +
        ef.parcelasReduzidas + ' parcelas a menos, parcela mantida em ' +
        _simFmt(ef.parcelaAntesCent) + '. Economia de juros de ' +
        _simFmt(ef.jurosEconomizadosCent) + '.'
    : titulo + ': nova parcela de ' + _simFmt(ef.parcelaDepoisCent) + ', ' +
        _simFmt(ef.parcelaAntesCent - ef.parcelaDepoisCent) + ' a menos por mes, prazo mantido em ' +
        ef.prazoDepois + ' meses. Economia de juros de ' +
        _simFmt(ef.jurosEconomizadosCent) + '.';

  // Acessivel por teclado: role=radio + tabindex + Enter/Espaco. So clique
  // deixaria a decisao inalcancavel para quem navega por teclado.
  return '<div class="sim-ef' + (selecionado ? ' sel' : '') + '" ' +
    'role="radio" aria-checked="' + (selecionado ? 'true' : 'false') + '" ' +
    'aria-label="' + esc(resumo) + '" ' +
    'tabindex="' + (selecionado ? '0' : '-1') + '" ' +
    'onclick="_simEscolherModalidade(\'' + mod + '\')" ' +
    'onkeydown="_simTeclaEfeito(event,\'' + mod + '\')">' +
    '<div class="sim-ef-top"><span class="sim-ef-nome">' + titulo + '</span>' +
      '<span class="sim-radio"></span></div>' +
    corpo +
    '<div class="sim-eco">Economia de juros<b>' +
      _simFmt(ef.jurosEconomizadosCent) + '</b></div>' +
    '</div>';
}


/* Teclado nos cards de decisao: Enter/Espaco escolhem; setas alternam entre os
   dois (padrao de radiogroup). Sem isso a decisao so existiria por clique. */
function _simTeclaEfeito(ev, mod) {
  const k = ev.key;
  if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
    ev.preventDefault();
    _simEscolherModalidade(mod);
    return;
  }
  if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
    ev.preventDefault();
    const outro = mod === 'reduzir_prazo' ? 'reduzir_prestacao' : 'reduzir_prazo';
    _simEscolherModalidade(outro);
    // devolve o foco ao card que passou a valer
    const alvo = document.querySelector('#view-simulador .sim-ef.sel');
    if (alvo) alvo.focus();
  }
}

function _simEscolherModalidade(mod) {
  SimuladorModule.modalidadeEscolhida = mod;
  _simAtualizarPrevia();
}

/* Passo 4 — decisão. Enquanto o extrato não estiver completo, mostra estado
   vazio ORIENTATIVO (o que falta), nunca alerta de erro no rodapé. */
function _simAtualizarPrevia() {
  const box = document.getElementById('sim-previa');
  if (!box) return;
  const f = _simLerFormulario();
  const v = _simValidarExtrato(f.extrato);

  if (!v.ok) {
    _simPintar(box,
      '<section class="card"><div class="card-body"><div class="sim-vazio">' +
        '<div class="sim-vazio-t">Falta preencher a posição do contrato</div>' +
        '<div>Assim que o extrato estiver completo, a comparação aparece aqui.</div>' +
        '<div class="sim-vazio-l">' +
          v.erros.map(function (e) { return '<span>' + esc(e) + '</span>'; }).join('') +
        '</div>' +
      '</div></div></section>');
    return;
  }

  const valor = _simParseMoeda(f.valorTxt);
  if (valor === null || valor <= 0n || !f.dataAmortizacao) {
    _simPintar(box,
      '<section class="card"><div class="card-body"><div class="sim-vazio">' +
        '<div class="sim-vazio-t">Informe quanto quer amortizar</div>' +
        '<div>Extrato validado. Com o valor, mostramos os dois caminhos lado a lado.</div>' +
      '</div></div></section>');
    return;
  }

  let imp;
  try {
    imp = _simCalcularImpacto(f.extrato, { valorCent: valor, dataAmortizacao: f.dataAmortizacao });
  } catch (e) {
    _simPintar(box,
      '<section class="card"><div class="card-body"><div class="sim-vazio" ' +
        'style="border-color:var(--warning);color:var(--text-primary);">' +
        '<div class="sim-vazio-t">Não foi possível calcular</div>' +
        '<div>' + esc(e.message || String(e)) + '</div>' +
      '</div></div></section>');
    return;
  }

  const escolhida = SimuladorModule.modalidadeEscolhida || 'reduzir_prazo';
  _simPintar(box,
    '<section class="card">' +
      _simCardHead(4, 'Comparar e decidir') +
      '<div class="card-body">' +
        '<p class="sim-ajuda">Amortizando <strong>' + _simFmt(valor) + '</strong> sobre o saldo de ' +
          '<strong>' + _simFmt(imp.base.principalCent) + '</strong> (extrato de ' +
          esc(f.extrato.dataReferencia) + '). Escolha um dos caminhos:</p>' +
        '<div class="sim-efeitos" role="radiogroup" ' +
          'aria-label="Efeito da amortizacao">' +
          _simCardEfeito('reduzir_prazo', imp.efeitos.reduzir_prazo, escolhida === 'reduzir_prazo') +
          _simCardEfeito('reduzir_prestacao', imp.efeitos.reduzir_prestacao,
            escolhida === 'reduzir_prestacao') +
        '</div>' +
        '<div class="sim-acoes">' +
          '<button class="btn-secondary" onclick="_simLimpar()">Nova simulação</button>' +
          '<button class="btn btn-primary" onclick="_simRegistrar()">Registrar escolha</button>' +
        '</div>' +
      '</div>' +
    '</section>');
}


function _simLimpar() {
  ['sim-saldo', 'sim-dataref', 'sim-taxa', 'sim-prazo', 'sim-am-valor', 'sim-am-data']
    .forEach(function (id) { const el = document.getElementById(id); if (el) el.value = ''; });
  const s = document.getElementById('sim-sistema');
  if (s) s.value = '';
  SimuladorModule.modalidadeEscolhida = 'reduzir_prazo';
  _simAtualizarPrevia();
}

// Registro local (memória da sessão) do que foi decidido.
function _simRegistrar() {
  const f = _simLerFormulario();
  const v = _simValidarExtrato(f.extrato);
  if (!v.ok) return showToast(_SIM_BLOQUEIO, 'error');
  const valor = _simParseMoeda(f.valorTxt);
  if (valor === null || valor <= 0n) return showToast('Valor da amortização inválido', 'error');
  // A data vem da data de corte do extrato; se falta, falta o campo de referência.
  if (!f.dataAmortizacao) return showToast('Informe a data de referência do saldo (extrato)', 'error');

  let imp;
  try { imp = _simCalcularImpacto(f.extrato, { valorCent: valor, dataAmortizacao: f.dataAmortizacao }); }
  catch (e) { return showToast('Falha ao calcular: ' + (e.message || e), 'error'); }

  const ef = imp.efeitos[f.modalidade];
  if (!ef || !ef.ok) return showToast('Efeito não aplicável: ' + (ef ? ef.erro : 'desconhecido'), 'error');

  const obra = (typeof obras !== 'undefined' ? obras : [])
    .find(function (o) { return String(o.id) === SimuladorModule.obraId; });

  SimuladorModule.lancamentos.unshift({
    id: 'a' + (SimuladorModule._seq++),
    obraNome: obra ? obra.nome : null,
    saldoAntesCent: v.dados.saldoCent,
    dataReferencia: v.dados.dataReferencia,
    taxaMensalPpb: v.dados.taxaMensalPpb,
    prazoAntes: v.dados.prazoMeses,
    sistema: v.dados.sistema,
    dataAmortizacao: f.dataAmortizacao,
    valorCent: valor,
    modalidade: f.modalidade,
    prazoDepois: ef.prazoDepois,
    parcelaAntesCent: ef.parcelaAntesCent,
    parcelaDepoisCent: ef.parcelaDepoisCent,
    jurosEconomizadosCent: ef.jurosEconomizadosCent
  });
  _simRenderLancamentos();
  showToast('Amortização registrada nesta sessão', 'success');
}

function _simRenderLancamentos() {
  const box = document.getElementById('sim-lancamentos');
  if (!box) return;
  const ls = SimuladorModule.lancamentos;
  if (ls.length === 0) { _simPintar(box, ''); return; }
  _simPintar(box, '<section class="card">' +
    '<div class="card-header"><span class="card-title">Registrado nesta sessão</span></div>' +
    '<div class="card-body">' +
    ls.map(function (l) {
      return '<div class="sim-lanc">' +
        '<div><strong>' + esc(l.obraNome || 'sem obra') + '</strong> · ' + esc(l.dataAmortizacao) +
        ' · ' + _simFmt(l.valorCent) + ' · ' +
        (l.modalidade === 'reduzir_prazo' ? 'reduzir prazo' : 'reduzir prestação') +
        '</div><div style="opacity:.75;margin-top:3px;">saldo base ' + _simFmt(l.saldoAntesCent) +
        ' (extrato ' + esc(l.dataReferencia) + ') · ' + esc(l.sistema) + ' · prazo ' + l.prazoAntes +
        ' → ' + l.prazoDepois + 'm · parcela ' + _simFmt(l.parcelaAntesCent) + ' → ' +
        _simFmt(l.parcelaDepoisCent) + ' · juros economizados ' +
        _simFmt(l.jurosEconomizadosCent) + '</div></div>';
    }).join('') + '</div></section>');
}

// ── Exporta para teste em Node (sem DOM) ────────────────────────────────────
if (typeof module === 'object' && module.exports) {
  module.exports = { _simValidarExtrato, _simCalcularImpacto, _simParseMoeda,
                     _simNumParaMoedaTxt, _simTaxaOrigemTexto, _simPrazoOrigemTexto,
                     _simRotuloObra, _simResolverObra,
                     // acessibilidade dos cards de decisão — tests/simulador-acessibilidade
                     _simCardEfeito, _simTeclaEfeito, SimuladorModule,
                     _SIM_BLOQUEIO, _SIM_BLOQUEIO_DATA, _SIM_NOTA_DATA };
}

// ── Registro no view registry (padrão do EDR) ───────────────────────────────
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('simulador', function () { renderSimulador(); });
}
