/* EDR System — landing v2 */

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;

  /* ---------------- Theme ---------------- */
  const saved = localStorage.getItem('edr-theme');
  if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  const updateLabel = () => {
    const lbl = document.querySelector('[data-theme-label]');
    if (lbl) lbl.textContent = root.getAttribute('data-theme') === 'dark' ? 'DARK' : 'LIGHT';
  };
  updateLabel();
  const tt = document.getElementById('themeToggle');
  if (tt) tt.addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('edr-theme', next);
    updateLabel();
  });

  /* ---------------- Count-up: big number ---------------- */
  const bignumVal = document.getElementById('bignumVal');
  const pciPct = document.getElementById('pciPct');
  const target = 446000.00;
  const dur = 2200;

  const fmtCurr = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct  = (n) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const runBig = () => {
    if (!bignumVal) return;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      bignumVal.textContent = fmtCurr(target * e);
      if (pciPct) pciPct.textContent = fmtPct(26.7 * e);
      if (p < 1) requestAnimationFrame(tick);
      else {
        bignumVal.textContent = fmtCurr(target);
        if (pciPct) pciPct.textContent = fmtPct(26.7);
      }
    };
    requestAnimationFrame(tick);
  };
  setTimeout(runBig, 250);

  /* ---------------- Iso stage parallax ---------------- */
  const isoStage = document.getElementById('isoStage');
  const iso = document.querySelector('.iso');
  const isDesktop = window.matchMedia('(min-width: 1025px)').matches;

  if (isoStage && isDesktop) {
    window.addEventListener('mousemove', (e) => {
      const mx = (e.clientX / window.innerWidth - .5) * 2;
      const my = (e.clientY / window.innerHeight - .5) * 2;
      isoStage.style.transform =
        `perspective(2400px) rotateX(${55 + my * 2}deg) rotateZ(${-28 + mx * 3}deg) translate3d(${mx*-8}px, ${my*-6}px, 0)`;
    }, { passive: true });
  }
  if (iso) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY * 0.35;
      iso.style.setProperty('--scroll-y', `${y}px`);
    }, { passive: true });
  }

  /* ---------------- Crosshair cursor over bignum ---------------- */
  const bignum = document.getElementById('bignum');
  const crosshair = document.getElementById('crosshair');
  if (bignum && crosshair && window.matchMedia('(pointer: fine)').matches) {
    bignum.addEventListener('mouseenter', () => { crosshair.classList.add('is-on'); bignum.classList.add('is-hover'); });
    bignum.addEventListener('mouseleave', () => { crosshair.classList.remove('is-on'); bignum.classList.remove('is-hover'); });
    bignum.addEventListener('mousemove', (e) => {
      crosshair.style.left = e.clientX + 'px';
      crosshair.style.top = e.clientY + 'px';
    });
  }

  /* ---------------- Breadcrumb on scroll ---------------- */
  const crumb = document.getElementById('crumb');
  if (crumb) {
    const sections = [
      { id: 'hero',     path: ['PAINEL', 'OBRAS', 'RESUMO'] },
      { id: 'wa',       path: ['EQUIPE', 'DIÁRIAS', 'FOLHA'] },
      { id: 'mcmv',     path: ['OBRAS', 'CEF', 'PCI'] },
      { id: 'pl',       path: ['FINANCEIRO', 'P&L', 'FLUXO'] },
      { id: 'gantt',    path: ['OBRAS', 'CRONOGRAMA', 'GANTT'] },
      { id: 'op',       path: ['ROTINA', 'DIÁRIO', 'ESTOQUE'] },
      { id: 'quem',     path: ['EDR', 'ORIGEM', 'PERNAMBUCO'] },
      { id: 'planos',   path: ['COMERCIAL', 'PLANOS', 'PREÇOS'] },
      { id: 'faq',      path: ['AJUDA', 'FAQ', 'DÚVIDAS'] },
      { id: 'wa-final', path: ['COMEÇAR', 'WHATSAPP', 'AGORA'] }
    ];
    let cur = -1;
    const updateCrumb = () => {
      let active = 0;
      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(sections[i].id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < window.innerHeight * 0.4) active = i;
      }
      if (active !== cur) {
        cur = active;
        const items = crumb.querySelectorAll('.crumb__item');
        items.forEach((it, i) => { it.textContent = sections[cur].path[i] || ''; });
      }
    };
    window.addEventListener('scroll', updateCrumb, { passive: true });
    updateCrumb();
  }

  /* ---------------- Terminal typing ---------------- */
  const W = (s) => `<span class="t-dim">${s}</span>`;
  const OK = (s) => `<span class="t-ok">${s}</span>`;
  const WARN = (s) => `<span class="t-warn">${s}</span>`;
  const MISS = (s) => `<span class="t-miss">${s}</span>`;
  const NUM  = (s) => `<span class="t-num">${s}</span>`;
  const HDR  = (s) => `<span class="t-hdr">${s}</span>`;
  const OB   = (s) => `<span class="t-obra">${s}</span>`;
  const OBP  = (s) => `<span class="t-obra-p">${s}</span>`;
  const OBN  = (s) => `<span class="t-obra-n">${s}</span>`;

  const row = (name, func, obra, val) => {
    const n = name.padEnd(10);
    const f = func.padEnd(10);
    const o = obra.padEnd(11);
    const v = ('R$ ' + val).padStart(10);
    return `  ${HDR(n)}${W(f)}${o}${NUM(v)}`;
  };

  const script = [
    { html: `${W('$')} edr folha --quinzena=2 --mes=abril`, delay: 200 },
    { html: ``, delay: 250 },
    { html: `${OK('›')} Analisando mensagem do mestre...`, delay: 450, bub: 'intro' },
    { html: `${OK('›')} ${OK('✓')} Mensagem recebida (${NUM('8')} linhas)`, delay: 500 },
    { html: `${OK('›')} Detectados: ${NUM('8')} funcionários · ${NUM('4')} obras`, delay: 500 },
    { html: `${OK('›')} Cruzando com cadastro de equipe...`, delay: 400 },
    { html: `${OK('›')} ${OK('✓')} Distribuição concluída`, delay: 400 },
    { html: ``, delay: 200 },
    { html: `${W('  ───────────────────────────────────────────')}`, delay: 120 },
    { html: `  ${W('NOME      FUNÇÃO    OBRA              VALOR')}`, delay: 120 },
    { html: `${W('  ───────────────────────────────────────────')}`, delay: 120 },
    { html: row('ANDERSON',  'Mestre',   OB('DUAM'),              '170,00'),        delay: 200, bub: 'ANDERSON JOSIMAR LEONARDO' },
    { html: row('JOSIMAR',   'Betoneiro',OB('DUAM'),              ' 90,00'),        delay: 200, bub: 'ANDERSON JOSIMAR LEONARDO' },
    { html: row('DIOGO',     'Pedreiro', `${OBP('LEO')}·${OB('DUAM')}`, '130,00'),  delay: 200, bub: 'DIOGO ROBERTO LEONARDO DUAM' },
    { html: row('ROBERTO',   'Servente', `${OBP('LEO')}·${OB('DUAM')}`, ' 80,00'),  delay: 200, bub: 'DIOGO ROBERTO LEONARDO DUAM' },
    { html: row('NALDINHO',  'Pedreiro', OBP('DAYANA'),            '130,00'),       delay: 200, bub: 'NALDINHO DAYANA' },
    { html: row('ADEILTON',  'Pedreiro', OBN('JUNIOR'),            '130,00'),       delay: 200, bub: 'ADEILTON ROSINALDO JUNIOR' },
    { html: row('ROSINALDO', 'Servente', OBN('JUNIOR'),            ' 80,00'),       delay: 200, bub: 'ADEILTON ROSINALDO JUNIOR' },
    { html: `${W('  ───────────────────────────────────────────')}`, delay: 180 },
    { html: ``, delay: 200 },
    { html: `${WARN('⚠')} ${MISS('FALTOU: IVANILTON')} ${W('(registrado como falta)')}`, delay: 400, bub: 'IVANILTON' },
    { html: ``, delay: 200 },
    { html: `${OK('›')} ${HDR('TOTAL DA QUINZENA:')} ${NUM('R$ 810,00')}`, delay: 400 },
    { html: `${OK('›')} Gerando PDF...`, delay: 450 },
    { html: `${OK('›')} ${OK('✓')} ${HDR('folha-q2-abr-2026.pdf')} ${W('(48kb)')}`, delay: 400 },
    { html: ``, delay: 200 },
    { html: `${OK('›')} ${OK('pronto pra pagar.')}`, delay: 300 },
  ];

  const termBody = document.getElementById('termBody');
  const term = document.getElementById('term');
  const chatBubs = Array.from(document.querySelectorAll('.bub'));

  const bubByKey = (key) => {
    if (!key) return null;
    const tokens = key.split(' ');
    return chatBubs.find(b => {
      const data = (b.dataset.bub || '');
      return tokens.every(t => data.includes(t));
    });
  };

  let termStarted = false;
  const runTerminal = () => {
    if (termStarted || !termBody || !term) return;
    termStarted = true;
    term.classList.add('is-typing');
    termBody.innerHTML = ''; // clear static fallback
    let html = '';
    let i = 0;
    const step = () => {
      if (i >= script.length) {
        term.classList.remove('is-typing');
        return;
      }
      const s = script[i++];
      html += s.html + '\n';
      termBody.innerHTML = html;
      termBody.scrollTop = termBody.scrollHeight;

      if (s.bub) {
        chatBubs.forEach(b => b.classList.remove('is-active'));
        const tgt = bubByKey(s.bub);
        if (tgt) {
          tgt.classList.add('is-active');
          setTimeout(() => tgt.classList.remove('is-active'), 1400);
        }
      }
      setTimeout(step, s.delay);
    };
    step();
  };

  // Terminal fires on its OWN visibility
  // Multiple safety nets: IO + immediate-visibility check + absolute timeout.
  if (term) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((ents) => {
        ents.forEach(e => {
          if (e.isIntersecting) { runTerminal(); io.disconnect(); }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -5% 0px' });
      io.observe(term);
    }
    // If already visible at load, fire immediately
    const rect = term.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setTimeout(runTerminal, 600);
    }
    // Absolute fallback — always fires within 4s
    setTimeout(runTerminal, 4000);
  }

  /* ---------------- PCI list (20 categorias) ---------------- */
  const pciList = document.getElementById('pciList');
  if (pciList) {
    const cats = [
      ['Serviços Preliminares',      100, 'R$ 18.240',  'green'],
      ['Fundação',                   100, 'R$ 62.400',  'green'],
      ['Supraestrutura',             100, 'R$ 84.120',  'green'],
      ['Paredes e Painéis',           87, 'R$ 56.880',  'green'],
      ['Esquadrias',                  64, 'R$ 28.400',  'yellow'],
      ['Cobertura',                   72, 'R$ 41.200',  'yellow'],
      ['Impermeabilização',          100, 'R$ 12.600',  'green'],
      ['Instalações Hidráulicas',     58, 'R$ 22.100',  'yellow'],
      ['Instalações Elétricas',       42, 'R$ 19.840',  'orange'],
      ['Instalações Especiais',        0, 'R$ 0',       'empty'],
      ['Revestimentos Internos',      34, 'R$ 14.920',  'orange'],
      ['Revestimentos Externos',      48, 'R$ 21.300',  'yellow'],
      ['Pintura',                      0, 'R$ 0',       'empty'],
      ['Pavimentação',                 0, 'R$ 0',       'empty'],
      ['Louças e Metais',              0, 'R$ 0',       'empty'],
      ['Complementação',               0, 'R$ 0',       'empty'],
      ['Urbanização e Paisagismo',     0, 'R$ 0',       'empty'],
      ['Limpeza',                      0, 'R$ 0',       'empty'],
      ['Ligações Definitivas',         0, 'R$ 0',       'empty'],
      ['Serviços Técnicos',           68, 'R$ 8.400',   'yellow'],
    ];
    const frag = document.createDocumentFragment();
    cats.forEach(([name, pct, val, color], i) => {
      const li = document.createElement('li');
      li.className = `pci-row pci-row--${color}`;
      li.style.setProperty('--p', pct + '%');
      li.style.transitionDelay = Math.min(i * 40, 600) + 'ms';
      li.innerHTML = `
        <span class="pci-row__idx">${String(i+1).padStart(2,'0')}</span>
        <span class="pci-row__name">${name}</span>
        <span class="pci-row__track"><span class="pci-row__fill"></span></span>
        <span class="pci-row__val">${val}</span>
        <span class="pci-row__pct">${pct}%</span>`;
      frag.appendChild(li);
    });
    pciList.appendChild(frag);
  }

  /* ---------------- Reveal observer ---------------- */
  const revealTargets = [
    ...document.querySelectorAll('[data-reveal]'),
    ...document.querySelectorAll('.pci-row'),
    ...document.querySelectorAll('#cashSvg'),
    ...document.querySelectorAll('#ganttArrows'),
  ];
  if ('IntersectionObserver' in window) {
    const rio = new IntersectionObserver((ents) => {
      ents.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          rio.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(t => rio.observe(t));
  } else {
    revealTargets.forEach(t => t.classList.add('is-visible'));
  }

  // Safety net: any reveal still hidden when user scrolls past its top gets revealed.
  // Also a hard timeout so nothing is ever stuck invisible.
  const safetyReveal = () => {
    revealTargets.forEach(t => {
      if (t.classList.contains('is-visible')) return;
      const r = t.getBoundingClientRect();
      if (r.top < window.innerHeight - 20) t.classList.add('is-visible');
    });
  };
  window.addEventListener('scroll', safetyReveal, { passive: true });
  setTimeout(safetyReveal, 600);
  // Hard fallback: after 8s, reveal anything still hidden.
  setTimeout(() => revealTargets.forEach(t => t.classList.add('is-visible')), 8000);
});
