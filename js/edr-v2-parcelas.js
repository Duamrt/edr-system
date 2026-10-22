// Parcelas revisadas pelo usuário. NF, fatura e boletos são valores distintos.
// Persistência atômica pelo servidor; pedidos incertos são repetidos com o mesmo ID.
const ParcelasConta = (() => {
  const PREFIXO = 'edr-parcelas-conta-v1:';
  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  function centavos(value) {
    let s = String(value ?? '').trim();
    if (s.includes(',')) {
      if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)) return null;
      s = s.replace(/\./g, '').replace(',', '.');
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(s)) return null;
    const [inteiro, decimal = ''] = s.split('.');
    const n = Number(inteiro) * 100 + Number(decimal.padEnd(2, '0'));
    return Number.isSafeInteger(n) && n <= 999999999999 ? n : null;
  }
  function dataValida(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    const [a, m, d] = s.split('-').map(Number);
    const dias = [31, a % 4 === 0 && (a % 100 !== 0 || a % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return a >= 1900 && a <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= dias[m - 1];
  }
  function validar(parcelas) {
    if (!parcelas.length || parcelas.length > 120) throw Error('Informe de 1 a 120 parcelas.');
    const numeros = new Set();
    return parcelas.map((p, i) => {
      const n = centavos(p.valor);
      if (n === null || n <= 0) throw Error(`Parcela ${i + 1}: informe um valor maior que zero, com até 2 casas decimais.`);
      if (!dataValida(p.vencimento)) throw Error(`Parcela ${i + 1}: informe um vencimento válido.`);
      const numero = String(p.numero || '').trim();
      if (numero && numeros.has(numero.toUpperCase())) throw Error(`Identificador de duplicata repetido: ${numero}. Confira as parcelas.`);
      if (numero.length > 60) throw Error('O identificador da duplicata deve ter até 60 caracteres.');
      if (numero) numeros.add(numero.toUpperCase());
      return { numero, valor_centavos: n, vencimento: p.vencimento };
    });
  }
  const company = () => typeof _companyId !== 'undefined' ? _companyId : '';
  const user = () => typeof usuarioAtual !== 'undefined' ? usuarioAtual?.id || '' : '';
  const prefixo = () => PREFIXO + company() + ':' + user() + ':';
  const chave = alvo => prefixo() + alvo;
  function pendencias() {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(prefixo())) continue;
      try {
        const item = JSON.parse(localStorage.getItem(key));
        if (item?.operacao_id && item?.pedido && item?.contexto) items.push({ ...item, key });
      } catch (_) { /* Um registro ilegível não autoriza novo envio. */ }
    }
    return items;
  }
  function temPendente(contaId) {
    return pendencias().some(p => p.pedido.conta_id === contaId);
  }
  function snapshot(c) {
    return {
      valor_centavos: centavos(c.valor), status: c.status,
      data_vencimento: c.data_vencimento ?? null, fornecedor: c.fornecedor ?? null,
      descricao: c.descricao ?? null, obra_id: c.obra_id ?? null,
      nota_id: c.nota_id ?? null, nota_ref: c.nota_ref ?? null,
    };
  }
  function renderPendencias() {
    let banner = document.getElementById('parcelas-pendencias');
    const list = document.getElementById('contas-lista');
    if (!list) return;
    const ps = pendencias();
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'parcelas-pendencias';
      list.insertAdjacentElement('beforebegin', banner);
    }
    banner.innerHTML = ps.length ? `<div class="parcela-aviso" role="status">
      Há ${ps.length} pedido(s) de parcelas aguardando confirmação. Recupere o resultado antes de cadastrar novamente.
      ${ps.map((p, i) => `<button type="button" class="btn" data-recuperar="${i}">Conferir ${escHtml(p.contexto.numero || 'conta')}</button>`).join('')}
      </div>` : '';
    banner.querySelectorAll('[data-recuperar]').forEach(b => b.onclick = () => abrir(ps[Number(b.dataset.recuperar)].contexto));
  }
  async function abrirDesdobramento(c) {
    if (!c || c.status !== 'pendente' || c.data_pagamento ||
        ['reembolso_fornecedor', 'despesa_operacional_nf'].includes(c.tipo)) {
      showToast('Somente uma conta pendente, sem pagamento ou baixa, pode ser desdobrada.'); return;
    }
    return abrir({
      modo: 'desdobrar', contaId: c.id, notaId: c.nota_id || null, fornecedor: c.fornecedor,
      descricao: c.descricao, obraId: c.obra_id || null, numero: c.nota_ref || '',
      valorTotalNF: null, valorOriginal: c.valor, original: snapshot(c),
    });
  }
  async function abrir(contexto) {
    if (document.getElementById('parcelas-conta-modal')) return;
    const sessao = { empresa: company(), usuario: user() };
    const mesmaSessao = () => company() === sessao.empresa && user() === sessao.usuario;
    const ctx = { modo: 'nota', ...contexto };
    const key = chave(ctx.modo + ':' + (ctx.contaId || ctx.notaId));
    let pendente = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        pendente = JSON.parse(raw);
        if (!pendente?.operacao_id || !pendente?.pedido) throw Error();
      }
    } catch (_) {
      showToast('Não foi possível ler o pedido anterior. Confira o Financeiro antes de repetir.'); return;
    }
    const ref = pendente?.contexto || ctx;
    const split = ref.modo === 'desdobrar';
    const totalNF = centavos(ref.valorTotalNF);
    const original = centavos(ref.valorOriginal);
    const despesas = centavos(ref.despesasJaRegistradas) || 0;
    const fat = ref.cobranca?.fatura;
    const dup = ref.cobranca?.duplicatas || [];
    let linhas = pendente ? pendente.pedido.parcelas.map(p => ({
      numero: p.numero, valor: (p.valor_centavos / 100).toFixed(2), vencimento: p.vencimento,
    })) : dup.length ? dup.map(p => ({ numero: p.numero || '', valor: p.valor || '', vencimento: p.vencimento || '' }))
      : [{ numero: '', valor: '', vencimento: '' }];
    let enviando = false;
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.id = 'parcelas-conta-modal';
      overlay.className = 'modal-overlay active';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'parcelas-titulo');
      overlay.innerHTML = `
        <style>
          #parcelas-conta-modal .modal-box{max-width:680px;width:calc(100% - 24px);max-height:92vh;overflow-y:auto}
          #parcelas-conta-modal .modal-body{padding:18px 24px}
          .parcela-resumo{display:flex;flex-wrap:wrap;gap:10px 24px;margin:16px 0;font-size:13px}
          .parcela-resumo strong{display:block;color:var(--text-primary);font-size:17px}
          .parcela-linha{display:grid;grid-template-columns:1fr 1.15fr 1.3fr auto;gap:8px;align-items:end;padding:12px 0;border-bottom:1px solid var(--border)}
          .parcela-linha label{font-size:12px;display:block;min-width:0}
          .parcela-linha input,#parcelas-motivo,#parcelas-data-pagamento{box-sizing:border-box;width:100%;min-width:0;margin-top:5px;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text-primary);font:inherit}
          .parcela-aviso{padding:12px;border-radius:8px;background:rgba(245,158,11,.10);color:var(--text-primary);font-size:13px;margin:12px 0}
          #parcelas-erro{color:#ef4444;font-size:13px;margin:10px 0}
          #parcelas-conta-modal .modal-footer{flex-wrap:wrap;gap:8px}
          #parcelas-conta-modal button{white-space:normal}
          @media(max-width:520px){#parcelas-conta-modal .modal-body{padding:14px}.parcela-linha{grid-template-columns:1fr 1fr}.parcela-linha button{justify-self:end}.parcela-linha label:first-child{grid-column:1 / -1}}
        </style>
        <div class="modal-box">
          <div class="modal-header"><span class="modal-title" id="parcelas-titulo">${split ? 'Desdobrar conta em parcelas' : 'Registrar pagamento?'}</span>
            <button type="button" class="btn-icon modal-close" aria-label="Fechar"><span class="material-symbols-outlined">close</span></button></div>
          <div class="modal-body">
            <p style="font-size:13px">${ref.numero ? 'NF ' + escHtml(ref.numero) + ' · ' : ''}${escHtml(ref.fornecedor)}</p>
            <div class="parcela-resumo">
              ${totalNF !== null ? `<div>Total da NF<strong>${moeda(totalNF)}</strong></div>` : ''}
              ${split ? `<div>Conta atual<strong>${moeda(original || 0)}</strong></div>` : ''}
              ${fat ? [['Fatura original', fat.valorOriginal], ['Desconto da fatura', fat.desconto], ['Fatura líquida', fat.valorLiquido]].map(([label, value]) =>
                `<div>${label}<strong>${centavos(value) !== null ? moeda(centavos(value)) : 'Não informado'}</strong></div>`).join('') : ''}
              <div>Soma das parcelas<strong id="parcelas-soma"></strong></div>
            </div>
            <p style="font-size:13px;color:var(--text-secondary)">${split
              ? 'A conta atual será substituída pela primeira parcela e pelas parcelas adicionais, com histórico preservado. Informe os valores e vencimentos de cada boleto.'
              : dup.length ? `${dup.length} duplicata(s) lida(s) do XML. Confira os valores e vencimentos antes de salvar.`
              : 'O XML não informa duplicatas. Informe o valor e o vencimento de cada boleto; nenhuma divisão ou data será presumida.'}</p>
            ${despesas > 0 ? `<div class="parcela-aviso">Já existem ${moeda(despesas)} de despesas desta NF registradas no Financeiro. Confira o que os boletos cobrem para não duplicar obrigações.</div>` : ''}
            <div id="parcelas-linhas"></div>
            <button type="button" class="btn" id="parcelas-adicionar" style="margin-top:12px">Adicionar parcela</button>
            <div id="parcelas-avisos" class="parcela-aviso" role="status"></div>
            <label id="parcelas-confirmacao-row" style="display:block;font-size:13px;margin:12px 0"><input type="checkbox" id="parcelas-confirmacao"> Conferi os boletos e confirmo as divergências/valores já registrados.</label>
            <label style="display:block;font-size:13px;margin-top:12px">Motivo / observação da revisão
              <input id="parcelas-motivo" maxlength="500" placeholder="${split ? 'Informe o motivo do desdobramento' : 'Opcional, salvo se houver despesas já registradas'}"></label>
            ${!split ? `<label style="display:block;font-size:13px;margin-top:14px"><input type="checkbox" id="parcelas-pago"> À vista — já pago</label>
              <label id="parcelas-data-row" style="display:none;font-size:13px;margin-top:10px">Data do pagamento<input id="parcelas-data-pagamento" type="date"></label>` : ''}
            <div id="parcelas-erro" role="alert"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn" id="parcelas-cancelar">${split ? 'Cancelar' : 'Não registrar agora'}</button>
            <button type="button" class="btn btn-primary" id="parcelas-salvar">${pendente ? 'Conferir pedido enviado' : 'Salvar contas a pagar'}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      const q = id => overlay.querySelector('#' + id);
      const anteriorFoco = document.activeElement;
      const fechar = () => {
        if (enviando) return;
        overlay.remove(); anteriorFoco?.focus(); renderPendencias(); resolve();
      };
      q('parcelas-cancelar').onclick = fechar;
      overlay.querySelector('.modal-close').onclick = fechar;
      overlay.addEventListener('keydown', e => {
        if (e.key === 'Escape') fechar();
        if (e.key === 'Tab') {
          const els = [...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled)')].filter(x => x.getClientRects().length);
          if (e.shiftKey && document.activeElement === els[0]) { e.preventDefault(); els.at(-1).focus(); }
          if (!e.shiftKey && document.activeElement === els.at(-1)) { e.preventDefault(); els[0].focus(); }
        }
      });
      function ler() {
        linhas = [...q('parcelas-linhas').querySelectorAll('.parcela-linha')].map(row => ({
          numero: row.querySelector('[data-campo="numero"]').value,
          valor: row.querySelector('[data-campo="valor"]').value,
          vencimento: row.querySelector('[data-campo="vencimento"]').value,
        }));
        return linhas;
      }
      function avisos() {
        const values = linhas.map(p => centavos(p.valor));
        const completo = values.every(v => v !== null && v > 0);
        const soma = values.reduce((s, v) => s + (v || 0), 0);
        q('parcelas-soma').textContent = moeda(soma) + (completo ? '' : ' (incompleta)');
        const warns = [];
        if (completo && totalNF !== null && soma !== totalNF) warns.push('A soma dos boletos difere do total da NF. Isso pode ocorrer; confira a cobrança.');
        const liquido = centavos(fat?.valorLiquido);
        if (completo && liquido !== null && soma !== liquido) warns.push('A soma dos boletos difere do valor líquido da fatura.');
        if (completo && split && soma !== original) warns.push('O total da obrigação será alterado. Confirme a diferença e registre o motivo.');
        if (dup.length && linhas.some(p => !dataValida(p.vencimento) || centavos(p.valor) === null)) warns.push('Há dados ausentes ou inválidos no XML. Preencha-os conforme os boletos.');
        q('parcelas-avisos').textContent = warns.join(' ');
        q('parcelas-avisos').style.display = warns.length ? '' : 'none';
        const exige = (completo && ((totalNF !== null && soma !== totalNF) || (liquido !== null && soma !== liquido) || (split && soma !== original))) || despesas > 0;
        q('parcelas-confirmacao-row').style.display = exige ? '' : 'none';
        return { soma, exige };
      }
      function bloquear() {
        overlay.querySelectorAll('input,#parcelas-adicionar,[data-remover]').forEach(el => { el.disabled = Boolean(pendente) || enviando; });
        q('parcelas-salvar').disabled = enviando;
        q('parcelas-cancelar').disabled = enviando;
        overlay.querySelector('.modal-close').disabled = enviando;
      }
      function renderLinhas() {
        q('parcelas-linhas').innerHTML = linhas.map((p, i) => `<div class="parcela-linha">
          <label>Parcela ${i + 1} · Identificador (opcional)<input aria-label="Identificador da parcela ${i + 1}" data-campo="numero" maxlength="60" value="${escHtml(p.numero)}"></label>
          <label>Valor R$<input aria-label="Valor da parcela ${i + 1}" data-campo="valor" inputmode="decimal" placeholder="0,00" value="${escHtml(p.valor)}"></label>
          <label>Vencimento<input aria-label="Vencimento da parcela ${i + 1}" data-campo="vencimento" type="date" value="${escHtml(dataValida(p.vencimento) ? p.vencimento : '')}"></label>
          <button type="button" class="btn" data-remover="${i}" aria-label="Remover parcela ${i + 1}">Remover</button></div>`).join('');
        q('parcelas-linhas').querySelectorAll('input').forEach(el => el.oninput = () => { ler(); q('parcelas-confirmacao').checked = false; avisos(); });
        q('parcelas-linhas').querySelectorAll('[data-remover]').forEach(el => el.onclick = () => {
          ler(); linhas.splice(Number(el.dataset.remover), 1); q('parcelas-confirmacao').checked = false; renderLinhas();
        });
        avisos(); bloquear();
      }
      q('parcelas-adicionar').onclick = () => {
        ler(); if (linhas.length >= 120) return;
        linhas.push({ numero: '', valor: '', vencimento: '' }); q('parcelas-confirmacao').checked = false; renderLinhas();
      };
      if (q('parcelas-pago')) q('parcelas-pago').onchange = () => {
        q('parcelas-data-row').style.display = q('parcelas-pago').checked ? '' : 'none';
      };
      if (pendente) {
        q('parcelas-motivo').value = pendente.pedido.motivo || '';
        q('parcelas-confirmacao').checked = pendente.pedido.aceitar_divergencia === true;
        if (q('parcelas-pago')) {
          q('parcelas-pago').checked = pendente.pedido.status === 'pago';
          q('parcelas-data-pagamento').value = pendente.pedido.data_pagamento || '';
          q('parcelas-pago').onchange();
        }
        q('parcelas-erro').textContent = 'Pedido aguardando confirmação. Os dados enviados estão preservados; confira usando o mesmo pedido.';
      }
      q('parcelas-salvar').onclick = async () => {
        if (enviando) return;
        if (!mesmaSessao()) { fechar(); showToast('A sessão mudou. Reabra a conta na empresa correta.'); return; }
        q('parcelas-erro').textContent = '';
        try {
          if (!pendente) {
            const parcelas = validar(ler());
            const { exige } = avisos();
            if (exige && !q('parcelas-confirmacao').checked) throw Error('Confira os valores e marque a confirmação da divergência.');
            const motivo = q('parcelas-motivo').value.trim();
            if ((split || despesas > 0) && !motivo) throw Error('Informe o motivo da revisão.');
            const pago = q('parcelas-pago')?.checked || false;
            if (pago && (parcelas.length !== 1 || !dataValida(q('parcelas-data-pagamento').value))) throw Error('Para pagamento à vista, informe uma parcela e a data real do pagamento.');
            const pedido = {
              modo: ref.modo, nota_id: ref.notaId || null, conta_id: ref.contaId || null,
              fornecedor: ref.fornecedor, descricao: ref.descricao || `NF ${ref.numero} — ${ref.fornecedor}`,
              obra_id: ref.obraId || null, nota_ref: ref.numero || null,
              status: pago ? 'pago' : 'pendente', data_pagamento: pago ? q('parcelas-data-pagamento').value : null,
              parcelas, motivo, aceitar_divergencia: q('parcelas-confirmacao').checked,
              original: ref.original || null,
            };
            pendente = { operacao_id: crypto.randomUUID(), pedido, contexto: ref };
            // Se o armazenamento falhar, não enviar: não haveria recuperação segura.
            try { localStorage.setItem(key, JSON.stringify(pendente)); } catch (_) { pendente = null; throw Error('Não foi possível guardar o pedido neste navegador. Nenhuma parcela foi enviada.'); }
          }
          enviando = true; bloquear();
          const r = await sbRpcEstoque('registrar_parcelas_conta', { p_operacao_id: pendente.operacao_id, p_pedido: pendente.pedido });
          if (!mesmaSessao()) {
            enviando = false; fechar();
            showToast('A sessão mudou. O pedido foi preservado para conferência na sessão original.', 6000);
            return;
          }
          if (!r?.ok) {
            if (r && !r.incerto) {
              localStorage.removeItem(key); pendente = null;
              throw Error(r.ausente ? 'O parcelamento ainda não foi habilitado no servidor. A NF permanece salva; nenhuma parcela foi criada por este pedido.' : r.mensagem || 'Não foi possível salvar as parcelas.');
            }
            throw Error('Confirmação não recebida. Use “Conferir pedido enviado” para recuperar o mesmo pedido sem duplicar.');
          }
          const recebidas = r.dados?.contas;
          const vinculoNF = pendente.pedido.nota_id || null;
          if (!Array.isArray(recebidas) || recebidas.length !== pendente.pedido.parcelas.length ||
              new Set(recebidas.map(c => c?.id)).size !== recebidas.length ||
              recebidas.some(c => !c || typeof c.id !== 'string' || !c.id || c.company_id !== sessao.empresa ||
                (c.nota_id || null) !== vinculoNF || !dataValida(c.data_vencimento) || !(centavos(c.valor) > 0))) {
            throw Error('Resposta incompleta ou incompatível. Confira o mesmo pedido antes de cadastrar novamente.');
          }
          if (typeof contasPagar !== 'undefined') {
            for (const c of r.dados.contas) {
              const i = contasPagar.findIndex(x => x.id === c.id);
              if (i < 0) contasPagar.push(c); else contasPagar[i] = c;
            }
          }
          localStorage.removeItem(key);
          pendente = null;
          enviando = false;
          fechar();
          if (typeof renderContasPagar === 'function') renderContasPagar();
          showToast(r.dados.repetida ? 'Pedido confirmado. As parcelas já estavam registradas.' : 'Parcelas registradas. Confira os vencimentos no Financeiro.', 6000);
        } catch (e) {
          q('parcelas-erro').textContent = e.message || 'Não foi possível concluir. Confira o pedido antes de repetir.';
        } finally {
          enviando = false;
          if (overlay.isConnected) {
            q('parcelas-salvar').textContent = pendente ? 'Conferir pedido enviado' : 'Salvar contas a pagar';
            bloquear();
          }
          renderPendencias();
        }
      };
      renderLinhas();
      overlay.querySelector('input:not(:disabled)')?.focus();
    });
  }
  return { abrir, abrirDesdobramento, renderPendencias, temPendente, centavos, dataValida, validar, snapshot };
})();
