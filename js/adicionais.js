const EDR_LOGO_B64 = 'data:image/png;base64,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FCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgAN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QBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARQigAQAAAAAoQgANAAAAAEARAmgAAAAAAIoQQAMAAAAAUIQAGgAAAACAIgTQAAAAAAAUIYAGAAAAAKAIATQAAAAAAEUIoAEAAAAAKEIADQAAAABAEQJoAAAAAACKEEADAAAAAFCEABoAAAAAgCIE0AAAAAAAFCGABgAAAACgCAE0AAAAAABFCKABAAAAAChCAA0AAAAAQBECaAAAAAAAihBAAwAAAABQhAAaAAAAAIAiBNAAAAAAABQhgAYAAAAAoAgBNAAAAAAARfz/azQAmB8FNucAAAAASUVORK5CYII=';

// ══════════════════════════════════════════
// ADICIONAIS / EXTRAS DA OBRA
// ══════════════════════════════════════════
let obrasAdicionais = [];
let adicionaisPgtos = [];

// Helper: totais de adicionais por obra
function getAdicionaisObra(obraId) {
  const lista = obrasAdicionais.filter(a => a.obra_id === obraId);
  const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
  const pgtos = adicionaisPgtos.filter(p => lista.some(a => a.id === p.adicional_id));
  const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
  const saldo = valorTotal - totalRecebido;
  return { qtd: lista.length, valorTotal, totalRecebido, saldo };
}

// Helper: total geral de adicionais (todas as obras ativas)
function getAdicionaisGeral(obraIds) {
  const set = obraIds instanceof Set ? obraIds : new Set(obraIds);
  const lista = obrasAdicionais.filter(a => set.has(a.obra_id));
  const valorTotal = lista.reduce((s, a) => s + Number(a.valor || 0), 0);
  const pgtos = adicionaisPgtos.filter(p => lista.some(a => a.id === p.adicional_id));
  const totalRecebido = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
  return { valorTotal, totalRecebido, saldo: valorTotal - totalRecebido };
}

async function loadAdicionais() {
  try { const r = await sbGet('obra_adicionais', '?order=criado_em.desc'); obrasAdicionais = Array.isArray(r) ? r : []; } catch(e) { obrasAdicionais = []; }
  try { const r = await sbGet('adicional_pagamentos', '?order=data.desc'); adicionaisPgtos = Array.isArray(r) ? r : []; } catch(e) { adicionaisPgtos = []; }
}

const STATUS_ADD = {
  pendente:    { lb: '⏳ PENDENTE',     cor: '#fbbf24', bg: 'rgba(245,158,11,0.1)', bd: 'rgba(245,158,11,0.3)' },
  aprovado:    { lb: '✅ APROVADO',     cor: 'var(--verde-hl)', bg: 'rgba(46,204,113,0.08)', bd: 'rgba(46,204,113,0.2)' },
  execucao:    { lb: '🔨 EM EXECUÇÃO', cor: '#60a5fa', bg: 'rgba(59,130,246,0.08)', bd: 'rgba(59,130,246,0.2)' },
  concluido:   { lb: '✔ CONCLUÍDO',    cor: 'var(--verde-hl)', bg: 'rgba(46,204,113,0.08)', bd: 'rgba(46,204,113,0.25)' },
};

function renderAdicionais() {
  const obraId = document.getElementById('obras-filtro-obra')?.value || '';
  const el = document.getElementById('adicionais-lista');
  const empty = document.getElementById('adicionais-empty');
  if (!el) return;
  const lista = obrasAdicionais.filter(a => !obraId || a.obra_id === obraId);
  if (!lista.length) { el.innerHTML = ''; empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  el.innerHTML = lista.map(a => {
    const st = STATUS_ADD[a.status] || STATUS_ADD.pendente;
    const pgtos = adicionaisPgtos.filter(p => p.adicional_id === a.id);
    const totalPago = pgtos.reduce((s, p) => s + Number(p.valor || 0), 0);
    const saldo = Number(a.valor || 0) - totalPago;
    const obraNome = [...obras, ...obrasArquivadas].find(o => o.id === a.obra_id)?.nome || '';
    const pagoPct = a.valor > 0 ? (totalPago / a.valor * 100).toFixed(0) : 0;
    const saldoColor = saldo > 0 ? '#fbbf24' : saldo === 0 ? 'var(--verde-hl)' : '#f87171';
    const alertaPago = a.status === 'concluido' && saldo > 0;

    const pgtoRows = pgtos.map(p =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:11px;border-bottom:1px solid var(--borda);">
        <span style="color:var(--texto2);">${p.data || '—'} · ${p.forma || ''}</span>
        <span style="color:var(--verde-hl);font-weight:700;">${fmtR(p.valor)}</span>
      </div>`
    ).join('');

    return `<div style="background:var(--bg2);border:1px solid ${st.bd};border-left:3px solid ${st.cor};border-radius:10px;padding:14px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
        <div style="flex:1;">
          ${!obraId ? `<div style="font-size:10px;color:var(--verde3);margin-bottom:3px;">${obraNome}</div>` : ''}
          <div style="font-size:14px;font-weight:700;color:var(--branco);">${a.descricao}</div>
          <div style="font-size:11px;color:var(--texto3);margin-top:2px;">${a.condicao || ''}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
          <span style="font-size:9px;padding:2px 8px;border-radius:4px;background:${st.bg};color:${st.cor};border:1px solid ${st.bd};font-weight:700;">${st.lb}</span>
          <span style="font-size:16px;font-weight:800;color:var(--branco);font-family:'JetBrains Mono',monospace;">${fmtR(a.valor)}</span>
        </div>
      </div>
      ${alertaPago ? `<div style="font-size:11px;color:#f87171;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;padding:6px 10px;margin-bottom:8px;font-weight:700;">⚠ CONCLUÍDO MAS FALTA RECEBER ${fmtR(saldo)}</div>` : ''}
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
        <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pagoPct}%;background:var(--verde3);border-radius:3px;transition:width .3s;"></div>
        </div>
        <span style="font-size:11px;color:var(--texto3);">Pago: ${fmtR(totalPago)}</span>
        <span style="font-size:11px;font-weight:700;color:${saldoColor};">Saldo: ${fmtR(saldo)}</span>
      </div>
      ${pgtos.length ? `<div style="margin-bottom:8px;padding:6px 8px;background:var(--bg3);border-radius:6px;">${pgtoRows}</div>` : ''}
      ${a.obs ? `<div style="font-size:10px;color:var(--texto3);margin-bottom:8px;">📌 ${a.obs}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <select onchange="mudarStatusAdicional('${a.id}',this.value)" style="padding:4px 8px;font-size:10px;background:var(--bg3);border:1px solid var(--borda2);border-radius:5px;color:var(--branco);font-family:inherit;cursor:pointer;">
          ${Object.entries(STATUS_ADD).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v.lb}</option>`).join('')}
        </select>
        <button onclick="abrirPgtoAdicional('${a.id}')" style="padding:4px 10px;font-size:10px;background:rgba(46,204,113,0.08);border:1px solid rgba(46,204,113,0.2);border-radius:5px;color:var(--verde-hl);font-weight:700;cursor:pointer;font-family:inherit;">💰 PAGAMENTO</button>
        <button onclick="gerarTermoAdicional('${a.id}')" style="padding:4px 10px;font-size:10px;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:5px;color:#a78bfa;font-weight:700;cursor:pointer;font-family:inherit;">📄 TERMO</button>
        <button onclick="editarAdicional('${a.id}')" style="padding:4px 10px;font-size:10px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:5px;color:#60a5fa;font-weight:700;cursor:pointer;font-family:inherit;">✏ EDITAR</button>
        <button onclick="excluirAdicional('${a.id}')" style="padding:4px 10px;font-size:10px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.15);border-radius:5px;color:#f87171;cursor:pointer;font-family:inherit;">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function abrirModalAdicional() {
  const obraId = document.getElementById('obras-filtro-obra')?.value;
  if (!obraId) { showToast('⚠ Selecione uma obra primeiro.'); return; }
  document.getElementById('add-edit-id').value = '';
  document.getElementById('add-descricao').value = '';
  document.getElementById('add-valor').value = '';
  document.getElementById('add-condicao').value = '';
  document.getElementById('add-obs').value = '';
  document.getElementById('add-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-adicional').classList.remove('hidden');
}

function editarAdicional(id) {
  const a = obrasAdicionais.find(x => x.id === id); if (!a) return;
  document.getElementById('add-edit-id').value = a.id;
  document.getElementById('add-descricao').value = a.descricao || '';
  document.getElementById('add-valor').value = a.valor || '';
  document.getElementById('add-condicao').value = a.condicao || '';
  document.getElementById('add-obs').value = a.obs || '';
  document.getElementById('add-data').value = a.data_acordo || '';
  document.getElementById('modal-adicional').classList.remove('hidden');
}

async function salvarAdicional() {
  const editId = document.getElementById('add-edit-id').value;
  const obraId = document.getElementById('obras-filtro-obra')?.value;
  const descricao = (document.getElementById('add-descricao').value || '').toUpperCase().trim();
  const valor = parseFloat(document.getElementById('add-valor').value) || 0;
  const condicao = (document.getElementById('add-condicao').value || '').toUpperCase().trim();
  const obs = (document.getElementById('add-obs').value || '').toUpperCase().trim();
  const data_acordo = document.getElementById('add-data').value;
  if (!descricao) { showToast('⚠ Informe a descrição do serviço.'); return; }
  if (valor <= 0) { showToast('⚠ Informe o valor.'); return; }
  if (!condicao) { showToast('⚠ Informe a condição de pagamento.'); return; }
  try {
    if (editId) {
      await sbPatch('obra_adicionais', `?id=eq.${editId}`, { descricao, valor, condicao, obs, data_acordo });
      const idx = obrasAdicionais.findIndex(a => a.id === editId);
      if (idx >= 0) Object.assign(obrasAdicionais[idx], { descricao, valor, condicao, obs, data_acordo });
      showToast('✅ Adicional atualizado!');
    } else {
      const [novo] = await sbPost('obra_adicionais', { obra_id: obraId, descricao, valor, condicao, obs, data_acordo, status: 'pendente' });
      obrasAdicionais.unshift(novo);
      showToast('✅ Serviço adicional registrado!');
    }
    fecharModal('adicional');
    renderAdicionais();
  } catch(e) { console.error(e); showToast('Erro ao salvar adicional.'); }
}

async function mudarStatusAdicional(id, status) {
  try {
    await sbPatch('obra_adicionais', `?id=eq.${id}`, { status });
    const a = obrasAdicionais.find(x => x.id === id);
    if (a) a.status = status;
    renderAdicionais();
    showToast(`Status → ${STATUS_ADD[status]?.lb || status}`);
  } catch(e) { showToast('Erro ao atualizar status.'); }
}

async function excluirAdicional(id) {
  if (!confirm('Excluir este serviço adicional e todos os pagamentos vinculados?')) return;
  try {
    await sbDelete('adicional_pagamentos', `?adicional_id=eq.${id}`);
    await sbDelete('obra_adicionais', `?id=eq.${id}`);
    obrasAdicionais = obrasAdicionais.filter(a => a.id !== id);
    adicionaisPgtos = adicionaisPgtos.filter(p => p.adicional_id !== id);
    renderAdicionais();
    showToast('Adicional excluído.');
  } catch(e) { showToast('Erro ao excluir.'); }
}

// ── PAGAMENTOS ──
function abrirPgtoAdicional(addId) {
  const a = obrasAdicionais.find(x => x.id === addId); if (!a) return;
  const totalPago = adicionaisPgtos.filter(p => p.adicional_id === addId).reduce((s, p) => s + Number(p.valor || 0), 0);
  const saldo = Number(a.valor) - totalPago;
  document.getElementById('pgto-add-id').value = addId;
  document.getElementById('pgto-saldo-info').innerHTML = `<strong>${a.descricao}</strong><br>Valor: ${fmtR(a.valor)} · Pago: ${fmtR(totalPago)} · <strong style="color:${saldo > 0 ? '#fbbf24' : 'var(--verde-hl)'}">Saldo: ${fmtR(saldo)}</strong>`;
  document.getElementById('pgto-valor').value = '';
  document.getElementById('pgto-data').value = new Date().toISOString().split('T')[0];
  document.getElementById('pgto-forma').value = '';
  document.getElementById('modal-add-pgto').classList.remove('hidden');
}

async function salvarPgtoAdicional() {
  const adicional_id = document.getElementById('pgto-add-id').value;
  const valor = parseFloat(document.getElementById('pgto-valor').value) || 0;
  const data = document.getElementById('pgto-data').value;
  const forma = (document.getElementById('pgto-forma').value || '').toUpperCase();
  if (valor <= 0) { showToast('⚠ Informe o valor.'); return; }
  try {
    const [novo] = await sbPost('adicional_pagamentos', { adicional_id, valor, data, forma });
    adicionaisPgtos.unshift(novo);
    fecharModal('add-pgto');
    renderAdicionais();
    showToast('✅ Pagamento registrado!');
  } catch(e) { console.error(e); showToast('Erro ao registrar pagamento.'); }
}

// ── TERMO DE AUTORIZAÇÃO (PDF) ──
function gerarTermoAdicional(id) {
  const a = obrasAdicionais.find(x => x.id === id); if (!a) return;
  const obra = [...obras, ...obrasArquivadas].find(o => o.id === a.obra_id);
  const obraNome = obra?.nome || '—';
  const obraCidade = obra?.cidade || 'JUPI-PE';
  const contratante = obra?.contratante || '';
  const cpfContratante = obra?.cpf_contratante || '';
  const dataAcordo = a.data_acordo ? new Date(a.data_acordo + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR');
  const valorExtenso = valorPorExtenso(a.valor);

  if (!contratante) { showToast('⚠ Preencha o nome do contratante na obra antes de gerar o termo. (Editar Obra)'); return; }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { margin: 25mm 20mm; }
  body { font-family: 'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; font-size: 12.5px; line-height: 1.9; max-width: 700px; margin: 0 auto; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #2d6a2e; padding-bottom: 16px; margin-bottom: 30px; }
  .header img { height: 80px; margin-bottom: 8px; }
  .header .empresa { font-size: 11px; color: #444; margin-top: 4px; letter-spacing: 1px; }
  .header .cnpj { font-size: 10.5px; color: #666; }
  .titulo { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: 3px; margin: 30px 0 24px 0; text-transform: uppercase; border: 2px solid #2d6a2e; padding: 10px; color: #1a1a1a; }
  .clausula { margin-bottom: 16px; text-align: justify; }
  .clausula strong { font-weight: 700; }
  .destaque { background: #f7f9f7; border-left: 3px solid #2d6a2e; padding: 12px 16px; margin: 16px 0; }
  .destaque .valor { font-size: 20px; font-weight: 700; color: #1a1a1a; }
  .assinaturas { display: flex; justify-content: space-between; margin-top: 60px; gap: 40px; }
  .assinatura { flex: 1; text-align: center; padding-top: 8px; border-top: 1px solid #1a1a1a; }
  .assinatura .nome { font-weight: 700; font-size: 11.5px; }
  .assinatura .info { font-size: 10px; color: #666; }
  .footer { text-align: center; font-size: 9px; color: #999; margin-top: 40px; border-top: 1px solid #ddd; padding-top: 8px; }
  .local-data { text-align: center; margin-top: 30px; font-size: 11.5px; }
</style></head><body>

<div class="header">
  <img src="${EDR_LOGO_B64}" alt="EDR Engenharia">
  <div class="empresa">RUA GERSON FERREIRA DE ALMEIDA, Nº 89, CENTRO — JUPI/PE</div>
  <div class="cnpj">CNPJ: 49.909.440/0001-55</div>
</div>

<div class="titulo">TERMO DE AUTORIZAÇÃO DE SERVIÇO ADICIONAL</div>

<div class="clausula">
  <strong>CLÁUSULA 1ª — DO OBJETO:</strong> O presente termo tem por finalidade formalizar a autorização para execução de serviço adicional na obra <strong>"${obraNome}"</strong>, localizada em <strong>${obraCidade}</strong>, conforme descrito abaixo:
</div>

<div class="destaque">
  <strong>SERVIÇO:</strong> ${a.descricao}<br>
</div>

<div class="clausula">
  <strong>CLÁUSULA 2ª — DO VALOR:</strong> O valor total para execução do serviço adicional acima descrito é de:
</div>

<div class="destaque">
  <div class="valor">R$ ${Number(a.valor).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</div>
  <div style="font-size:11px;color:#555;margin-top:2px;">(${valorExtenso})</div>
</div>

<div class="clausula">
  <strong>CLÁUSULA 3ª — DAS CONDIÇÕES DE PAGAMENTO:</strong> ${a.condicao}
</div>

<div class="clausula">
  <strong>CLÁUSULA 4ª — DO PRAZO:</strong> O serviço adicional será executado conforme cronograma da obra, sem prejuízo das atividades contratadas originalmente. O prazo específico será acordado entre as partes e poderá sofrer alterações em razão de condições climáticas ou de abastecimento de materiais.
</div>

<div class="clausula">
  <strong>CLÁUSULA 5ª — DAS RESPONSABILIDADES:</strong> A <strong>EDR ENGENHARIA</strong> se compromete a executar o serviço com qualidade, utilizando materiais adequados e mão de obra qualificada. O CONTRATANTE declara estar ciente de que este serviço é adicional ao contrato original e que seu custo não está incluído no financiamento habitacional.
</div>

<div class="clausula">
  <strong>CLÁUSULA 6ª — DA AUTORIZAÇÃO:</strong> O(A) Sr(a). <strong>${contratante}</strong>, portador(a) do CPF nº <strong>${cpfContratante || '___.___.___-__'}</strong>, ao assinar este termo, autoriza expressamente a execução do serviço descrito na Cláusula 1ª, nas condições estabelecidas neste instrumento.
</div>

${a.obs ? `<div class="clausula"><strong>OBSERVAÇÕES:</strong> ${a.obs}</div>` : ''}

<div class="local-data">
  ${obraCidade}, ${dataAcordo}
</div>

<div class="assinaturas">
  <div class="assinatura">
    <div class="nome">${contratante}</div>
    <div class="info">CPF: ${cpfContratante || '___.___.___-__'}</div>
  </div>
  <div class="assinatura">
    <div class="nome">EDR ENGENHARIA</div>
    <div class="info">CNPJ: 49.909.440/0001-55</div>
  </div>
</div>

<div class="footer">Documento gerado pelo EDR System em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</div>

</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// Valor por extenso simplificado
function valorPorExtenso(valor) {
  const unidades = ['','um','dois','três','quatro','cinco','seis','sete','oito','nove'];
  const especiais = ['dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
  const dezenas = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
  const centenas = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

  function grupoExtenso(n) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    let r = '';
    const c = Math.floor(n / 100), resto = n % 100;
    if (c > 0) r += centenas[c];
    if (resto > 0) {
      if (r) r += ' e ';
      if (resto < 10) r += unidades[resto];
      else if (resto < 20) r += especiais[resto - 10];
      else { r += dezenas[Math.floor(resto/10)]; if (resto%10) r += ' e ' + unidades[resto%10]; }
    }
    return r;
  }

  const v = Math.abs(Number(valor));
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);
  if (inteiro === 0 && centavos === 0) return 'zero reais';
  let r = '';
  const milhares = Math.floor(inteiro / 1000);
  const resto = inteiro % 1000;
  if (milhares > 0) {
    r += grupoExtenso(milhares) + (milhares === 1 ? ' mil' : ' mil');
    if (resto > 0) r += (resto < 100 ? ' e ' : ' ');
  }
  if (resto > 0) r += grupoExtenso(resto);
  if (inteiro > 0) r += inteiro === 1 ? ' real' : ' reais';
  if (centavos > 0) {
    if (inteiro > 0) r += ' e ';
    r += grupoExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
  }
  return r;
}
