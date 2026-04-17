/* ============================================================
   EDR V2 — DiarioModule (V2 Upgrade)
   Diario de Obra: relato diario + upload de fotos + clima
   Tabela: diario_registros
   ============================================================ */

const DiarioModule = {

  // ── Estado ──
  registros: [],
  obras: [],
  filtroObra: '',
  filtroData: '',
  _carregado: false,
  _salvando: false,

  // ── Render principal ──
  async render(container) {
    if (!container) return;
    container.innerHTML = DiarioModule._skeleton();
    await DiarioModule._carregarObras();
    await DiarioModule._carregar();
    DiarioModule._carregado = true;
    requestAnimationFrame(() => {
      container.innerHTML = DiarioModule._html();
      DiarioModule._bind(container);
    });
  },

  _skeleton() {
    return '<div style="max-width:700px;margin:0 auto;padding:16px;">' +
      '<div style="height:48px;background:var(--skeleton);border-radius:12px;margin-bottom:16px;animation:pulse 1.5s infinite"></div>' +
      '<div style="height:200px;background:var(--skeleton);border-radius:12px;margin-bottom:12px;animation:pulse 1.5s infinite"></div>' +
      '<div style="height:120px;background:var(--skeleton);border-radius:12px;margin-bottom:8px;animation:pulse 1.5s infinite"></div>'.repeat(3) +
    '</div>';
  },

  // ── Carregar obras ──
  async _carregarObras() {
    try {
      const todasObras = typeof obras !== 'undefined' ? obras : [];
      DiarioModule.obras = todasObras.filter(o => !o.arquivada).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    } catch (e) { DiarioModule.obras = []; }
  },

  // ── Carregar registros ──
  async _carregar() {
    try {
      let params = 'select=*&order=data.desc,criado_em.desc&limit=60';
      if (DiarioModule.filtroObra) params += '&obra_id=eq.' + DiarioModule.filtroObra;
      if (DiarioModule.filtroData) params += '&data=eq.' + DiarioModule.filtroData;
      const data = await sbGet('diario_registros?' + params);
      DiarioModule.registros = Array.isArray(data) ? data : [];
    } catch (e) {
      console.error('DiarioModule._carregar:', e);
      DiarioModule.registros = [];
    }
  },

  // ── HTML principal ──
  _html() {
    const hoje = new Date().toISOString().split('T')[0];
    const hojeLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

    const obrasOpts = DiarioModule.obras.map(o =>
      '<option value="' + o.id + '"' + (DiarioModule.filtroObra === o.id ? ' selected' : '') + '>' + (o.nome || '') + '</option>'
    ).join('');

    const obrasFormOpts = DiarioModule.obras.map(o =>
      '<option value="' + o.id + '">' + (o.nome || '') + '</option>'
    ).join('');

    const stats = DiarioModule._calcStats();

    let html = '<div style="max-width:700px;margin:0 auto;padding:0 0 90px;">';

    // Header sticky
    html += '<div style="position:sticky;top:0;z-index:90;background:var(--bg);border-bottom:1px solid var(--border);padding:14px 16px;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
        '<div>' +
          '<div style="font-family:\'Plus Jakarta Sans\',sans-serif;font-size:16px;font-weight:800;letter-spacing:-0.5px;">EDR <span style="color:var(--primary);">Diário</span></div>' +
          '<div style="font-size:11px;color:var(--text-tertiary);">' + hojeLabel + '</div>' +
        '</div>' +
        '<button id="diario-btn-novo" style="background:var(--primary);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;">' +
          '<span class="material-symbols-outlined" style="font-size:15px;">add</span>NOVO REGISTRO' +
        '</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;">' +
        '<select id="diario-filtro-obra" style="flex:1;background:var(--surface);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-family:inherit;font-size:12px;">' +
          '<option value="">Todas as obras</option>' + obrasOpts +
        '</select>' +
        '<input type="date" id="diario-filtro-data" value="' + (DiarioModule.filtroData || '') + '" style="background:var(--surface);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-family:inherit;font-size:12px;">' +
      '</div>' +
    '</div>';

    // Stats
    html += '<div style="display:flex;gap:8px;padding:12px 16px;overflow-x:auto;">';
    html += DiarioModule._statCard(stats.total, 'Registros', 'var(--text-primary)');
    html += DiarioModule._statCard(stats.hoje, 'Hoje', 'var(--primary)');
    html += DiarioModule._statCard(stats.fotos, 'Fotos', '#8b5cf6');
    html += DiarioModule._statCard(stats.obras, 'Obras', '#ea580c');
    html += '</div>';

    // Formulário modal embutido (oculto inicialmente)
    html += '<div id="diario-form-wrapper" style="display:none;margin:0 16px 16px;background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;">';
    html += '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
      '<div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:16px;color:var(--primary);">edit_note</span>Novo Registro</div>' +
      '<button id="diario-btn-fechar-form" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);padding:2px;">' +
        '<span class="material-symbols-outlined" style="font-size:20px;">close</span>' +
      '</button>' +
    '</div>';
    html += '<div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px;">';

    // Campo: Obra
    html += '<div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">OBRA</div>' +
      '<select id="diario-form-obra" style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;">' +
        '<option value="">Selecione a obra...</option>' + obrasFormOpts +
      '</select>' +
    '</div>';

    // Campo: Data
    html += '<div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">DATA</div>' +
      '<input type="date" id="diario-form-data" value="' + hoje + '" style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;box-sizing:border-box;">' +
    '</div>';

    // Campo: Clima
    html += '<div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:6px;">CLIMA</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        DiarioModule._climaBtn('ensolarado', '☀️', 'Ensolarado') +
        DiarioModule._climaBtn('nublado', '☁️', 'Nublado') +
        DiarioModule._climaBtn('parcialmente_nublado', '⛅', 'Parcial') +
        DiarioModule._climaBtn('chuvoso', '🌧️', 'Chuvoso') +
      '</div>' +
    '</div>';

    // Campo: Relato
    html += '<div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:4px;">RELATO DO DIA</div>' +
      '<textarea id="diario-form-relato" rows="4" placeholder="Descreva as atividades do dia, problemas encontrados, decisões tomadas..." style="width:100%;padding:9px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;line-height:1.6;resize:vertical;box-sizing:border-box;"></textarea>' +
    '</div>';

    // Campo: Fotos
    html += '<div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;margin-bottom:6px;">FOTOS</div>' +
      '<label id="diario-label-foto" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;background:var(--bg);border:2px dashed var(--border);border-radius:8px;cursor:pointer;color:var(--text-secondary);font-size:12px;font-weight:600;transition:border-color .15s;" onmouseover="this.style.borderColor=\'var(--primary)\'" onmouseout="this.style.borderColor=\'var(--border)\'">' +
        '<span class="material-symbols-outlined" style="font-size:20px;color:var(--primary);">add_a_photo</span>Adicionar fotos (máx. 4)' +
      '</label>' +
      '<input type="file" id="diario-form-fotos" accept="image/*" multiple style="display:none;">' +
      '<div id="diario-fotos-preview" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;"></div>' +
    '</div>';

    html += '<button id="diario-btn-salvar" style="padding:11px;border-radius:10px;border:none;background:var(--primary);color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;">SALVAR REGISTRO</button>';
    html += '</div></div>';

    // Lista de registros
    if (DiarioModule.registros.length === 0) {
      html += '<div style="text-align:center;padding:60px 20px;color:var(--text-tertiary);">' +
        '<span class="material-symbols-outlined" style="font-size:48px;color:var(--primary);margin-bottom:12px;">edit_note</span>' +
        '<div style="font-weight:600;">Nenhum registro encontrado.</div><div style="font-size:13px;margin-top:4px;">Clique em "Novo Registro" para começar.</div>' +
      '</div>';
    } else {
      // Agrupar por data
      const porData = {};
      DiarioModule.registros.forEach(r => {
        const k = r.data || 'sem-data';
        if (!porData[k]) porData[k] = [];
        porData[k].push(r);
      });

      Object.entries(porData).forEach(([data, regs]) => {
        const dataFmt = data !== 'sem-data'
          ? new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
          : 'Sem data';

        html += '<div style="margin:0 16px 4px;padding:8px 0;border-bottom:1px solid var(--border);">' +
          '<div style="font-size:11px;font-weight:700;color:var(--text-tertiary);letter-spacing:1px;text-transform:uppercase;">' + dataFmt + '</div>' +
        '</div>';

        regs.forEach(r => {
          const obraObj = DiarioModule.obras.find(o => o.id === r.obra_id);
          const obraNome = obraObj?.nome || 'Obra não vinculada';
          const fotos = Array.isArray(r.fotos) ? r.fotos : [];
          const climaIcon = DiarioModule._climaIcon(r.clima);

          html += '<div style="margin:0 16px 10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;">';

          // Header do card
          html += '<div style="padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-start;">' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;">' +
                '<span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;color:var(--primary);">home_work</span> ' +
                (typeof esc === 'function' ? esc(obraNome) : obraNome) +
              '</div>' +
              '<div style="font-size:11px;color:var(--text-tertiary);">' + (r.criado_por || '') + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
              '<span style="font-size:18px;" title="' + (r.clima || '') + '">' + climaIcon + '</span>' +
              '<button onclick="DiarioModule.excluir(\'' + r.id.replace(/'/g,"&#39;") + '\')" style="background:none;border:none;cursor:pointer;color:var(--text-tertiary);padding:2px;" title="Excluir">' +
                '<span class="material-symbols-outlined" style="font-size:16px;">delete</span>' +
              '</button>' +
            '</div>' +
          '</div>';

          // Relato
          if (r.relato) {
            html += '<div style="padding:0 12px 10px;font-size:12px;color:var(--text-secondary);line-height:1.6;white-space:pre-line;">' +
              (typeof esc === 'function' ? esc(r.relato) : r.relato) +
            '</div>';
          }

          // Fotos
          if (fotos.length > 0) {
            html += '<div style="display:flex;gap:4px;padding:0 12px 10px;overflow-x:auto;">';
            fotos.forEach((f, i) => {
              html += '<img src="' + f + '" onclick="DiarioModule.verFoto(\'' + r.id + '\',' + i + ')" style="height:80px;width:80px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border);flex-shrink:0;">';
            });
            html += '</div>';
          }

          html += '</div>';
        });
      });
    }

    html += '</div>';
    return html;
  },

  _climaBtn(valor, emoji, label) {
    return '<button class="diario-clima-btn" data-valor="' + valor + '" style="display:flex;align-items:center;gap:4px;padding:6px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text-secondary);font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;transition:all .15s;">' +
      emoji + ' ' + label +
    '</button>';
  },

  _climaIcon(clima) {
    const icons = {
      ensolarado: '☀️',
      nublado: '☁️',
      parcialmente_nublado: '⛅',
      chuvoso: '🌧️',
      nao_informado: '—'
    };
    return icons[clima] || '—';
  },

  _statCard(valor, label, cor) {
    return '<div style="flex:1;min-width:70px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px;text-align:center;">' +
      '<div style="font-size:20px;font-weight:800;color:' + cor + ';">' + valor + '</div>' +
      '<div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:1px;margin-top:2px;">' + label + '</div>' +
    '</div>';
  },

  _calcStats() {
    const hoje = new Date().toISOString().split('T')[0];
    const total = DiarioModule.registros.length;
    const hojeCount = DiarioModule.registros.filter(r => r.data === hoje).length;
    const fotos = DiarioModule.registros.reduce((s, r) => s + (Array.isArray(r.fotos) ? r.fotos.length : 0), 0);
    const obrasSet = new Set(DiarioModule.registros.filter(r => r.obra_id).map(r => r.obra_id));
    return { total, hoje: hojeCount, fotos, obras: obrasSet.size };
  },

  // ── Bind eventos ──
  _bind(container) {
    // Filtros
    const selObra = container.querySelector('#diario-filtro-obra');
    if (selObra) {
      selObra.addEventListener('change', async () => {
        DiarioModule.filtroObra = selObra.value;
        await DiarioModule._carregar();
        requestAnimationFrame(() => { container.innerHTML = DiarioModule._html(); DiarioModule._bind(container); });
      });
    }
    const selData = container.querySelector('#diario-filtro-data');
    if (selData) {
      selData.addEventListener('change', async () => {
        DiarioModule.filtroData = selData.value;
        await DiarioModule._carregar();
        requestAnimationFrame(() => { container.innerHTML = DiarioModule._html(); DiarioModule._bind(container); });
      });
    }

    // Botão novo
    const btnNovo = container.querySelector('#diario-btn-novo');
    const formWrapper = container.querySelector('#diario-form-wrapper');
    if (btnNovo && formWrapper) {
      btnNovo.addEventListener('click', () => {
        formWrapper.style.display = formWrapper.style.display === 'none' ? 'block' : 'none';
        if (formWrapper.style.display === 'block') {
          formWrapper.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    // Botão fechar form
    const btnFechar = container.querySelector('#diario-btn-fechar-form');
    if (btnFechar && formWrapper) {
      btnFechar.addEventListener('click', () => { formWrapper.style.display = 'none'; });
    }

    // Clima buttons
    let climaSelecionado = 'nao_informado';
    container.querySelectorAll('.diario-clima-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        climaSelecionado = btn.dataset.valor;
        container.querySelectorAll('.diario-clima-btn').forEach(b => {
          b.style.background = 'var(--bg)';
          b.style.borderColor = 'var(--border)';
          b.style.color = 'var(--text-secondary)';
        });
        btn.style.background = 'rgba(45,106,79,0.12)';
        btn.style.borderColor = 'var(--primary)';
        btn.style.color = 'var(--primary)';
        DiarioModule._climaSelecionado = climaSelecionado;
      });
    });
    DiarioModule._climaSelecionado = 'nao_informado';

    // Upload fotos
    const inputFotos = container.querySelector('#diario-form-fotos');
    const labelFoto = container.querySelector('#diario-label-foto');
    const preview = container.querySelector('#diario-fotos-preview');
    DiarioModule._fotosBase64 = [];

    if (labelFoto && inputFotos) {
      labelFoto.addEventListener('click', () => inputFotos.click());
      inputFotos.addEventListener('change', () => {
        const files = Array.from(inputFotos.files).slice(0, 4);
        DiarioModule._fotosBase64 = [];
        if (preview) preview.innerHTML = '';
        let count = 0;
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = (e) => {
            DiarioModule._comprimirFoto(e.target.result, (b64) => {
              DiarioModule._fotosBase64.push(b64);
              if (preview) {
                const img = document.createElement('img');
                img.src = b64;
                img.style.cssText = 'height:70px;width:70px;object-fit:cover;border-radius:6px;border:1px solid var(--border);';
                // botão remover
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative;';
                const del = document.createElement('button');
                del.innerHTML = '✕';
                del.style.cssText = 'position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:16px;height:16px;font-size:10px;cursor:pointer;padding:0;line-height:1;';
                del.addEventListener('click', () => {
                  const idx = DiarioModule._fotosBase64.indexOf(b64);
                  if (idx >= 0) DiarioModule._fotosBase64.splice(idx, 1);
                  wrap.remove();
                });
                wrap.appendChild(img);
                wrap.appendChild(del);
                preview.appendChild(wrap);
              }
            });
          };
          reader.readAsDataURL(file);
        });
      });
    }

    // Salvar
    const btnSalvar = container.querySelector('#diario-btn-salvar');
    if (btnSalvar) {
      btnSalvar.addEventListener('click', () => DiarioModule._salvar(container));
    }
  },

  // ── Comprimir foto (canvas resize) ──
  _comprimirFoto(dataUrl, callback) {
    const img = new Image();
    img.onload = () => {
      const MAX = 800;
      let w = img.width, h = img.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = dataUrl;
  },

  // ── Salvar registro ──
  async _salvar(container) {
    if (DiarioModule._salvando) return;
    const obraId = container.querySelector('#diario-form-obra')?.value || '';
    const data = container.querySelector('#diario-form-data')?.value || '';
    const relato = (container.querySelector('#diario-form-relato')?.value || '').trim().toUpperCase();
    const clima = DiarioModule._climaSelecionado || 'nao_informado';
    const fotos = DiarioModule._fotosBase64 || [];

    if (!obraId) { showToast('Selecione a obra'); return; }
    if (!data) { showToast('Informe a data'); return; }
    if (!relato && fotos.length === 0) { showToast('Adicione um relato ou pelo menos uma foto'); return; }

    const btn = container.querySelector('#diario-btn-salvar');
    if (btn) { btn.textContent = 'SALVANDO...'; btn.disabled = true; }
    DiarioModule._salvando = true;

    try {
      await sbPost('diario_registros', {
        obra_id: obraId,
        data,
        relato,
        clima,
        fotos,
        criado_por: (typeof usuarioAtual !== 'undefined' && usuarioAtual?.nome) || ''
      });

      DiarioModule._salvando = false;
      DiarioModule._fotosBase64 = [];

      await DiarioModule._carregar();
      requestAnimationFrame(() => {
        container.innerHTML = DiarioModule._html();
        DiarioModule._bind(container);
      });
      showToast('Registro salvo!');
    } catch (e) {
      console.error('DiarioModule._salvar:', e);
      showToast('Erro ao salvar registro');
      if (btn) { btn.textContent = 'SALVAR REGISTRO'; btn.disabled = false; }
      DiarioModule._salvando = false;
    }
  },

  // ── Excluir registro ──
  async excluir(id) {
    const ok = await confirmar('Excluir este registro do diário?');
    if (!ok) return;
    try {
      await sbDelete('diario_registros', '?id=eq.' + id);
      DiarioModule.registros = DiarioModule.registros.filter(r => r.id !== id);
      const container = document.getElementById('view-diario');
      if (container) {
        container.innerHTML = DiarioModule._html();
        DiarioModule._bind(container);
      }
      showToast('Registro excluído');
    } catch (e) {
      showToast('Erro ao excluir');
    }
  },

  // ── Ver foto ampliada ──
  verFoto(regId, idx) {
    const r = DiarioModule.registros.find(x => x.id === regId);
    if (!r || !Array.isArray(r.fotos) || !r.fotos[idx]) return;
    let overlay = document.getElementById('diario-foto-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'diario-foto-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer;';
      overlay.addEventListener('click', () => overlay.remove());
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<img src="' + r.fotos[idx] + '" style="max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px;">';
    overlay.style.display = 'flex';
  }
};

// ── Registro no viewRegistry ──
if (typeof viewRegistry !== 'undefined') {
  viewRegistry.register('diario', (container) => DiarioModule.render(container));
}
