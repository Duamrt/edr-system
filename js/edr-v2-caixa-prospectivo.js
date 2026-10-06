// Caixa prospectivo: abertura declarada + movimentos efetivos persistidos por RPC.
// O estado abaixo é somente cache de leitura; nunca é uma fonte operacional de saldo.
let _cpEstado = null;
let _cpEstadoAtor = null;
let _cpErro = '';
let _cpFormulario = null;
let _cpEnviando = false;
let _cpLeitura = 0;
let _cpConsultaPendente = null;
function _cpInvalidarLeitura() {
  ++_cpLeitura; _cpConsultaPendente=null; _cpEstado=null; _cpEstadoAtor=null;
}
const _cpFuso = 'America/Sao_Paulo';
// Journal de intenção para recuperar respostas incertas após reload.
// Guarda UUID/pedido, nunca saldo; a confirmação continua exclusiva do banco.
function _cpJournalKey() { return 'edr-caixa-pedido:' + _companyId; }
function _cpGuardarPendente(pedido, cancelamento = false) {
  const raw = JSON.stringify({company_id:_companyId,operacao:pedido.operacao,pedido:pedido.pedido,cancelamento});
  sessionStorage.setItem(_cpJournalKey(),raw);
  if (sessionStorage.getItem(_cpJournalKey())!==raw) throw new Error('Não foi possível guardar a chave de recuperação. Nenhum pedido enviado.');
}
function _cpLerPendente() {
  try {
    const j=JSON.parse(sessionStorage.getItem(_cpJournalKey())||'null');
    return j?.company_id===_companyId && /^[0-9a-f-]{36}$/i.test(j.operacao) && j.pedido && typeof j.pedido==='object' ? j : null;
  } catch (_) { return null; }
}
function _cpLimparPendente() { try { sessionStorage.removeItem(_cpJournalKey()); } catch (_) {} }

function caixaProspectivoPodeOperar() {
  return typeof _companyId !== 'undefined' && !!_companyId &&
    typeof usuarioAtual !== 'undefined' && usuarioAtual?.perfil === 'admin';
}
function caixaProspectivoEstado() {
  return caixaProspectivoPodeOperar() && _cpEstadoAtor === usuarioAtual && _cpEstado?.company_id === _companyId ? _cpEstado : null;
}
function caixaProspectivoCentavos(valor) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(valor))) throw new Error('Informe um valor com até duas casas decimais.');
  const [inteiro, fracao = ''] = String(valor).split('.');
  const cents = Number(inteiro) * 100 + Number(fracao.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) throw new Error('Valor fora do limite.');
  return cents;
}
function _cpDinheiro(cents) { return fmt(Number(cents) / 100); }
function _cpAgora() {
  const p = new Intl.DateTimeFormat('sv-SE', { timeZone: _cpFuso, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = tipo => p.find(x => x.type === tipo).value;
  return `${v('year')}-${v('month')}-${v('day')}T${v('hour')}:${v('minute')}`;
}
function _cpMarco(conta) {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: conta.fuso, dateStyle: 'short', timeStyle: 'short' });
  return p.format(new Date(conta.corte_em)) + ' · ' + conta.fuso;
}
async function caixaProspectivoCarregar() {
  const tenant = typeof _companyId !== 'undefined' ? _companyId : null;
  if (!caixaProspectivoPodeOperar()) {
    _cpInvalidarLeitura();
    _cpErro='Controle de saldo disponível para administradores da empresa.';
    return null;
  }
  const ator=usuarioAtual;
  if (_cpConsultaPendente?.tenant === tenant && _cpConsultaPendente.ator===ator && _cpConsultaPendente.perfil===ator.perfil) return _cpConsultaPendente.promise;
  const pendente={tenant,ator,perfil:ator.perfil,promise:null};
  pendente.promise=_cpCarregarBanco();
  _cpConsultaPendente=pendente;
  try {return await pendente.promise;}
  finally {if (_cpConsultaPendente===pendente) _cpConsultaPendente=null;}
}
async function _cpCarregarBanco() {
  const leitura = ++_cpLeitura;
  const tenant = typeof _companyId !== 'undefined' ? _companyId : null;
  const ator = typeof usuarioAtual !== 'undefined' ? usuarioAtual : null;
  _cpEstado = null;
  _cpEstadoAtor = null;
  _cpErro = '';
  if (!caixaProspectivoPodeOperar()) { _cpErro = 'Controle de saldo disponível para administradores da empresa.'; return null; }
  try {
    const r = await sbRpcEstoque('caixa_estado', {});
    if (leitura !== _cpLeitura || tenant !== _companyId || ator !== usuarioAtual || !caixaProspectivoPodeOperar()) return null;
    if (!r?.ok || r.dados?.company_id !== tenant || !Array.isArray(r.dados.contas) || !Array.isArray(r.dados.movimentos) || !Array.isArray(r.dados.pagamentos)) {
      _cpErro = r?.ausente ? 'Controle prospectivo ainda não instalado no banco.' : 'Não foi possível consultar o saldo persistido. Recarregue.';
      return null;
    }
    _cpEstado = r.dados;
    _cpEstadoAtor = ator;
    return _cpEstado;
  } catch (_) {
    if (leitura === _cpLeitura) _cpErro = 'Não foi possível consultar o saldo persistido. Recarregue.';
    return null;
  }
}
function caixaProspectivoRestante(conta) {
  const p = caixaProspectivoEstado()?.pagamentos.find(x => x.conta_pagar_id === conta.id);
  return p ? Number(p.restante_centavos) / 100 : Number(conta.valor || 0);
}
function caixaProspectivoVinculada(id) {
  return !!caixaProspectivoEstado()?.movimentos.some(m => m.conta_pagar_id === id);
}
async function caixaProspectivoPodeAlterarConta(id) {
  const e = await caixaProspectivoCarregar();
  if (!e) { showToast('Não foi possível conferir os pagamentos persistidos. Recarregue antes de alterar a obrigação.'); return false; }
  if (e.movimentos.some(m => m.conta_pagar_id === id)) { showToast('Conta vinculada ao controle prospectivo. Preserve a obrigação e consulte os movimentos.'); return false; }
  return true;
}
function _cpCampo(id, label, input) {
  return `<label style="display:grid;gap:5px;font-size:12px;">${label}${input.replace('<input ', `<input id="${id}" `).replace('<select ', `<select id="${id}" `)}</label>`;
}
const _cpEstiloCampo = 'style="width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-primary);font:inherit;box-sizing:border-box;"';
function _cpFormularioHtml() {
  const f = _cpFormulario;
  if (!f) return '';
  const contas = caixaProspectivoEstado()?.contas || [];
  const options = contas.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
  let campos;
  if (f.tipo === 'abertura') {
    campos = _cpCampo('cp-corte', 'Data e horário do saldo informado (São Paulo)', `<input type="datetime-local" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-banco', 'Saldo informado C6 PJ (R$)', `<input type="number" min="0" step="0.01" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-dinheiro', 'Saldo informado dinheiro no escritório (R$)', `<input type="number" min="0" step="0.01" required ${_cpEstiloCampo}>`) +
      '<p style="font-size:12px;color:var(--text-secondary);">Informe a foto de saldo no marco. A abertura não é receita nem conciliação. Depois de salva, não pode ser substituída nesta tela.</p>';
  } else {
    campos = _cpCampo('cp-conta', 'Conta de origem / conta movimentada', `<select ${_cpEstiloCampo}>${options}</select>`);
    if (f.tipo === 'transferencia') campos += _cpCampo('cp-destino', 'Conta de destino', `<select ${_cpEstiloCampo}>${options}</select>`) +
      '<p style="font-size:12px;">Transferência mantém o total. Registre tarifa como saída separada.</p>';
    if (f.tipo === 'pagamento') {
      const c = (typeof contasPagar !== 'undefined' ? contasPagar : []).find(x => x.id === f.contaPagarId);
      campos += `<p id="cp-obrigacao">${esc(c?.descricao || c?.fornecedor || 'Conta a pagar')} · restante ${_cpDinheiro(Math.round(caixaProspectivoRestante(c || {}) * 100))}</p>`;
      if (c?.obra_id && !c.nota_id && !c.nota_ref) campos += '<label style="font-size:12px;"><input id="cp-custo-confirmado" type="checkbox"> Confirmo que o custo desta conta já foi registrado na obra. Se ainda falta, registre-o em Custos antes de pagar. Este pagamento não lança custo.</label>';
    }
    campos += _cpCampo('cp-valor', 'Valor efetivamente movimentado (R$)', `<input type="number" min="0.01" step="0.01" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-data', 'Data efetiva (São Paulo)', `<input type="date" required ${_cpEstiloCampo}>`) +
      _cpCampo('cp-hora', 'Horário efetivo, se conhecido (São Paulo)', `<input type="time" ${_cpEstiloCampo}>`) +
      _cpCampo('cp-decisao', 'Sem horário no dia do corte: posição em relação à abertura', `<select ${_cpEstiloCampo}><option value="">Selecione se a data for o dia do corte</option><option value="incluido_abertura">Já incluído no saldo de abertura</option><option value="apos_corte">Ocorreu após o marco de abertura</option></select>`) +
      _cpCampo('cp-descricao', 'Descrição / referência do comprovante', `<input type="text" maxlength="500" required ${_cpEstiloCampo}>`) +
      '<p style="font-size:12px;color:var(--text-secondary);">Registre cada movimento uma vez. Custo, consumo e fechamento da folha não confirmam pagamento. Movimentos anteriores ou já incluídos na abertura não mudam o saldo.</p>';
  }
  return `<div id="cp-modal" class="modal-overlay active" role="dialog" aria-modal="true" aria-labelledby="cp-titulo">
    <div class="modal-box" style="max-width:520px;"><div class="modal-header"><span id="cp-titulo" class="modal-title">${esc({abertura:'Declarar abertura',entrada:'Entrada efetiva',saida:'Saída efetiva',transferencia:'Transferir entre contas',pagamento:'Pagamento efetivo'}[f.tipo])}</span></div>
    <form onsubmit="event.preventDefault();caixaProspectivoSalvar()"><div class="modal-body" style="display:grid;gap:12px;">${campos}<p id="cp-erro" role="alert" style="color:var(--error);font-size:12px;"></p></div>
    <div class="modal-footer"><button type="button" class="btn" id="cp-cancelar" onclick="caixaProspectivoCancelarFormulario()">Cancelar</button><button class="btn btn-primary" id="cp-salvar" type="submit">Salvar</button></div></form></div></div>`;
}
function _cpDesenhar(el) {
  const e = caixaProspectivoEstado();
  const card = 'background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px;margin-bottom:14px;';
  if (!e) {
    el.innerHTML = `<div style="${card}" role="alert">${esc(_cpErro || 'Saldo indisponível.')} <button class="btn" onclick="renderCaixa()">Recarregar</button></div>`;
    return;
  }
  let html = `<div style="${card}"><h3 style="margin:0 0 8px;font-size:15px;">Banco e dinheiro · controle prospectivo</h3><p style="font-size:12px;color:var(--text-secondary);">Saldo informado no marco + movimentos efetivos posteriores. Obrigações a pagar ficam separadas do disponível.</p><p style="font-size:12px;color:var(--text-secondary);">Registre aqui os recebimentos e pagamentos por conta, inclusive os cadastrados como pagos em outros módulos. Esses cadastros não são importados automaticamente.</p>`;
  if (_cpLerPendente()) html += '<p role="alert">Há um pedido pendente de confirmação. Confira antes de registrar outro movimento.</p><button class="btn" onclick="caixaProspectivoConferirPendente()">Conferir pedido pendente</button>';
  if (!e.contas.length) {
    html += '<p>Declare a abertura para iniciar o controle. O saldo manual antigo será preservado.</p><button class="btn btn-primary" onclick="caixaProspectivoAbrir(\'abertura\')">Declarar abertura</button></div>';
  } else {
    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;">${e.contas.map(c => `<div><div style="font-size:12px;">${esc(c.nome)}</div><strong style="font-size:24px;color:var(--primary);">${_cpDinheiro(c.saldo_centavos)}</strong><div style="font-size:11px;color:var(--text-secondary);">Abertura: ${_cpDinheiro(c.abertura_centavos)}<br>${esc(_cpMarco(c))}</div></div>`).join('')}<div><div>TOTAL DISPONÍVEL</div><strong style="font-size:24px;color:var(--primary);">${_cpDinheiro(e.total_centavos)}</strong></div></div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">' + ['entrada','saida','transferencia'].map(tipo => `<button class="btn ${tipo==='entrada'?'btn-primary':''}" onclick="caixaProspectivoAbrir('${tipo}')">${{entrada:'Entrada',saida:'Saída',transferencia:'Transferência'}[tipo]}</button>`).join('') + '</div></div>';
  }
  const obrigacoes = (typeof contasPagar !== 'undefined' ? contasPagar : []).filter(c => c.tipo !== 'reembolso_fornecedor' && !['pago','cancelado'].includes(c.status) && caixaProspectivoRestante(c) > 0);
  const pagar = obrigacoes.reduce((s,c) => s + Math.round(caixaProspectivoRestante(c)*100),0);
  html += `<div style="${card}"><h3 style="margin:0 0 8px;font-size:14px;">Obrigações a pagar · ${_cpDinheiro(pagar)}</h3><p style="font-size:12px;">Contas cadastradas ainda não quitadas. Folha a pagar e outras obrigações precisam estar cadastradas; lançar custo não altera o disponível.</p>${obrigacoes.map(c => `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border);"><span>${esc(c.fornecedor || c.descricao)} · ${fmtData(c.data_vencimento)}</span><span>${fmt(caixaProspectivoRestante(c))} ${e.contas.length ? `<button class="btn" onclick="caixaProspectivoAbrir('pagamento','${esc(c.id)}')">Pagar</button>` : ''}</span></div>`).join('') || '<p>Nenhuma obrigação cadastrada pendente.</p>'}</div>`;
  const nomes = new Map(e.contas.map(c => [c.id,c.nome]));
  html += `<div style="${card}"><h3 style="font-size:14px;margin:0 0 8px;">Movimentos efetivos</h3>${e.movimentos.map(m => `<div style="border-top:1px solid var(--border);padding:10px 0;${m.cancelado_em?'opacity:.6;':''}"><div>${esc(m.descricao)} · ${esc(m.tipo)} · ${_cpDinheiro(m.valor_centavos)}</div><div style="font-size:12px;color:var(--text-secondary);">${esc(nomes.get(m.conta_id)||'')} ${m.destino_id?' → '+esc(nomes.get(m.destino_id)||''):''} · ${fmtData(m.data_efetiva)} ${esc(m.hora_efetiva||'sem horário')} · ${m.cancelado_em?'Cancelado':m.afeta_saldo?'Movimenta saldo':'Incluído na abertura'} ${!m.cancelado_em ? `<button class="btn" onclick="caixaProspectivoCancelarMovimento('${esc(m.id)}')">Cancelar movimento</button>`:''}</div></div>`).join('') || '<p style="font-size:12px;">Nenhum movimento registrado.</p>'}</div>`;
  if (typeof projecoesCaixa !== 'undefined') html += `<div style="${card}"><h3 style="font-size:14px;margin:0 0 8px;">Entradas previstas</h3><p style="font-size:12px;">Projeções não integram o saldo disponível.</p>${projecoesCaixa.map(p => `<div style="font-size:12px;padding:5px 0;">${fmtData(p.data_prevista)} · ${esc(p.descricao||p.tipo)} · ${fmt(p.valor)}</div>`).join('')}<button class="btn" onclick="abrirModalProjecao(null)">Adicionar previsão</button></div>`;
  el.innerHTML = html;
}
async function caixaProspectivoRender(el) {
  el.innerHTML = '<p role="status">Consultando saldo persistido…</p>';
  const e = await caixaProspectivoCarregar();
  if (e && typeof sbGet === 'function') {
    try {
      const cs = await sbGet('contas_pagar','?order=data_vencimento',{throwOnError:true});
      if (!Array.isArray(cs)) throw new Error();
      if (e.company_id !== _companyId) return;
      contasPagar = cs;
    } catch (_) {
      _cpEstado = null;
      _cpErro = 'Não foi possível consultar as obrigações persistidas. Recarregue.';
    }
  }
  _cpDesenhar(el);
}
async function caixaProspectivoAbrir(tipo, contaPagarId = null) {
  if (_cpEnviando || _cpFormulario?.incerto || _cpCancelamento || _cpLerPendente()) { showToast('Confira o pedido pendente antes de iniciar outro.'); return; }
  if (!caixaProspectivoPodeOperar()) { showToast('Ação disponível para administradores.'); return; }
  const ator = usuarioAtual;
  if (!['abertura','entrada','saida','transferencia','pagamento'].includes(tipo)) return;
  const e = await caixaProspectivoCarregar();
  if (!caixaProspectivoPodeOperar() || ator !== usuarioAtual) return;
  if (!e) { showToast(_cpErro); return; }
  if (tipo === 'abertura' ? e.contas.length > 0 : e.contas.length !== 2) { showToast(tipo==='abertura'?'Abertura já declarada.':'Declare a abertura primeiro.'); return; }
  if (tipo === 'pagamento') {
    try {
      const cs = await sbGet('contas_pagar','?order=data_vencimento',{throwOnError:true});
      if (!Array.isArray(cs) || e.company_id !== _companyId || ator !== usuarioAtual || !caixaProspectivoPodeOperar()) throw new Error();
      contasPagar = cs;
    } catch (_) { showToast('Não foi possível consultar a obrigação persistida. Recarregue.'); return; }
    const c = (typeof contasPagar !== 'undefined' ? contasPagar : []).find(x => x.id === contaPagarId);
    if (!c || ['pago','cancelado'].includes(c.status) || c.tipo==='reembolso_fornecedor') { showToast('Conta indisponível para pagamento. Recarregue.'); return; }
  }
  document.getElementById('cp-modal')?.remove();
  _cpFormulario = {tipo,contaPagarId,company_id:_companyId,ator:usuarioAtual,pedido:null,operacao:null,incerto:false};
  document.body.insertAdjacentHTML('beforeend',_cpFormularioHtml());
  const agora = _cpAgora();
  if (tipo==='abertura') document.getElementById('cp-corte').value = agora;
  else {
    document.getElementById('cp-data').value = agora.slice(0,10);
    if (tipo==='transferencia') document.getElementById('cp-destino').value = e.contas[1].id;
  }
  document.getElementById(tipo==='abertura'?'cp-corte':'cp-valor')?.focus();
}
function caixaProspectivoCancelarFormulario() {
  if (_cpEnviando || _cpFormulario?.incerto) { showToast('Resultado pendente. Reenvie o mesmo pedido para conferir.'); return; }
  _cpFormulario = null;
  document.getElementById('cp-modal')?.remove();
}
function _cpPedido() {
  const valor = id => document.getElementById(id)?.value || '';
  const e = caixaProspectivoEstado();
  if (_cpFormulario.tipo==='abertura') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor('cp-corte'))) throw new Error('Informe data e horário do marco.');
    return {action:'abertura',corte_local:valor('cp-corte'),fuso:_cpFuso,contas:[
      {codigo:'banco',nome:'C6 PJ',saldo_centavos:caixaProspectivoCentavos(valor('cp-banco'))},
      {codigo:'dinheiro',nome:'Dinheiro no escritório',saldo_centavos:caixaProspectivoCentavos(valor('cp-dinheiro'))}]};
  }
  const p = {action:'movimento',tipo:_cpFormulario.tipo,conta_id:valor('cp-conta'),destino_id:valor('cp-destino')||null,
    valor_centavos:caixaProspectivoCentavos(valor('cp-valor')),data_efetiva:valor('cp-data'),hora_efetiva:valor('cp-hora')||null,
    decisao_corte:valor('cp-decisao')||null,descricao:valor('cp-descricao').trim(),conta_pagar_id:_cpFormulario.contaPagarId};
  if (p.valor_centavos<=0 || !p.descricao || !/^\d{4}-\d{2}-\d{2}$/.test(p.data_efetiva)) throw new Error('Informe valor, data efetiva e descrição.');
  if (document.getElementById('cp-custo-confirmado') && !document.getElementById('cp-custo-confirmado').checked) throw new Error('Registre o custo na obra e confirme antes do pagamento.');
  if (document.getElementById('cp-custo-confirmado')) p.custo_confirmado = true;
  if (p.tipo==='transferencia' && p.conta_id===p.destino_id) throw new Error('Selecione duas contas diferentes.');
  const conta = e?.contas.find(c => c.id===p.conta_id);
  const diaCorte = conta && new Intl.DateTimeFormat('sv-SE',{timeZone:conta.fuso,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(conta.corte_em));
  if (!p.hora_efetiva && p.data_efetiva===diaCorte && !p.decisao_corte) throw new Error('No dia do corte sem horário, indique se já estava incluído na abertura.');
  if (p.hora_efetiva || p.data_efetiva !== diaCorte) p.decisao_corte = null;
  return p;
}
function _cpCongelar(congelar) {
  document.querySelectorAll('#cp-modal input,#cp-modal select').forEach(el => {el.disabled=congelar;});
  const cancelar = document.getElementById('cp-cancelar');
  if (cancelar) cancelar.disabled = congelar;
}
async function caixaProspectivoSalvar() {
  if (_cpEnviando || !_cpFormulario) return;
  if (!caixaProspectivoPodeOperar() || _cpFormulario.company_id!==_companyId || _cpFormulario.ator!==usuarioAtual) { showToast('Sessão mudou. Recarregue antes de salvar.'); return; }
  const f = _cpFormulario;
  const erro = document.getElementById('cp-erro');
  try {
    if (!f.incerto) { f.pedido=_cpPedido(); f.operacao=crypto.randomUUID(); }
    _cpGuardarPendente(f);
  } catch (e) { if (erro) erro.textContent=e.message; return; }
  _cpEnviando=true;
  _cpCongelar(true);
  const botao=document.getElementById('cp-salvar');
  if (botao) botao.disabled=true;
  let r;
  try { r=await sbRpcEstoque('caixa_registrar',{p_operacao:f.operacao,p_pedido:f.pedido}); }
  catch (_) { r={ok:false,incerto:true,mensagem:'Conexão interrompida. Reenvie o mesmo pedido para conferir.'}; }
  _cpEnviando=false;
  if (botao) botao.disabled=false;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual || !caixaProspectivoPodeOperar()) { _cpFormulario=null; _cpEstado=null; document.getElementById('cp-modal')?.remove(); showToast('Sessão mudou. Confira o pedido na empresa de origem.'); return; }
  if (r?.ok && (r.dados?.operacao_id !== f.operacao || r.dados?.company_id !== f.company_id)) r={ok:false,incerto:true,mensagem:'Resposta incompleta. Reenvie o mesmo pedido para conferir.'};
  if (!r?.ok) {
    f.incerto=f.incerto || !!r?.incerto;
    if (!f.incerto) _cpLimparPendente();
    _cpCongelar(f.incerto);
    if (erro) erro.textContent=r?.ausente?'Controle prospectivo ainda não instalado.':r?.mensagem||'Falha ao persistir. Nenhum sucesso confirmado.';
    if (botao) botao.textContent=f.incerto?'Conferir / reenviar mesmo pedido':'Salvar';
    return;
  }
  _cpFormulario=null;
  _cpLimparPendente();
  document.getElementById('cp-modal')?.remove();
  _cpInvalidarLeitura();
  showToast('Registro persistido.');
  if (typeof _loadContasPagar==='function') await _loadContasPagar();
  if (typeof renderCaixa==='function') await renderCaixa();
  if (typeof renderContasPagar==='function') renderContasPagar();
}
let _cpCancelamento=null;
async function caixaProspectivoCancelarMovimento(id) {
  if (_cpEnviando || !caixaProspectivoPodeOperar()) return;
  if (_cpFormulario || (_cpCancelamento && _cpCancelamento.id!==id)) { showToast('Confira o pedido pendente antes de cancelar outro movimento.'); return; }
  if (!_cpCancelamento) {
    const m=caixaProspectivoEstado()?.movimentos.find(x=>x.id===id && !x.cancelado_em);
    if (!m) return;
    if (_cpLerPendente()) { showToast('Confira o pedido pendente antes de cancelar.'); return; }
    const motivo=prompt('Motivo do cancelamento (o registro será preservado para auditoria):');
    if (!motivo?.trim()) return;
    _cpCancelamento={id,company_id:_companyId,ator:usuarioAtual,incerto:false,operacao:crypto.randomUUID(),pedido:{action:'cancelar',movimento_id:id,motivo:motivo.trim()}};
  }
  const f=_cpCancelamento;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual) { showToast('Sessão mudou. Recarregue.'); return; }
  try { _cpGuardarPendente(f,true); } catch (_) { _cpCancelamento=null; showToast('Não foi possível guardar a chave de recuperação. Nenhum pedido enviado.'); return; }
  _cpEnviando=true;
  let r;
  try { r=await sbRpcEstoque('caixa_registrar',{p_operacao:f.operacao,p_pedido:f.pedido}); }
  catch (_) { r={ok:false,incerto:true}; }
  _cpEnviando=false;
  if (f.company_id!==_companyId || f.ator!==usuarioAtual || !caixaProspectivoPodeOperar()) { _cpCancelamento=null; _cpEstado=null; showToast('Sessão mudou. Confira o pedido na empresa de origem.'); return; }
  if (r?.ok && (r.dados?.operacao_id !== f.operacao || r.dados?.company_id !== f.company_id)) r={ok:false,incerto:true};
  if (!r?.ok) {
    f.incerto=f.incerto || !!r?.incerto;
    if (!f.incerto) { _cpCancelamento=null; _cpLimparPendente(); }
    showToast(f.incerto?'Resultado incerto. Use o mesmo botão para conferir o cancelamento.':r?.mensagem||'Falha ao cancelar.');
    return;
  }
  _cpCancelamento=null;
  _cpLimparPendente();
  _cpInvalidarLeitura();
  showToast('Cancelamento persistido.');
  if (typeof _loadContasPagar==='function') await _loadContasPagar();
  await renderCaixa();
  if (typeof renderContasPagar==='function') renderContasPagar();
}
async function caixaProspectivoConferirPendente() {
  if (_cpEnviando || !caixaProspectivoPodeOperar()) return;
  const j=_cpLerPendente();
  if (!j) return;
  if (j.cancelamento) {
    _cpCancelamento={...j,id:j.pedido.movimento_id,ator:usuarioAtual,incerto:true};
    await caixaProspectivoCancelarMovimento(_cpCancelamento.id);
    return;
  }
  _cpFormulario={...j,tipo:j.pedido.action==='abertura'?'abertura':j.pedido.tipo,contaPagarId:j.pedido.conta_pagar_id,ator:usuarioAtual,incerto:true};
  document.getElementById('cp-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',_cpFormularioHtml());
  document.getElementById('cp-erro').textContent='Conferindo o pedido anterior com a mesma chave.';
  await caixaProspectivoSalvar();
}
