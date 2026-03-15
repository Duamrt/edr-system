// ========== MODO DEMO ==========
let MODO_DEMO = false;
let _demoNextId = 9000;
function _demoId() { return ++_demoNextId; }

const DEMO_DATA = {
  usuarios: [
    {id:'d1',usuario:'demo',senha:'demo',perfil:'admin',nome:'Ana Costa',ativo:true},
    {id:'d2',usuario:'demo_op',senha:'demo_op',perfil:'operacional',nome:'Carlos Operador',ativo:true}
  ],
  obras: [
    {id:'demo-obra-1',nome:'Vila das Flores',cidade:'Recife',status:'em_andamento',arquivada:false,valor_venda:350000,criado_em:'2024-01-10T00:00:00'},
    {id:'demo-obra-2',nome:'Jardim Primavera',cidade:'Caruaru',status:'em_andamento',arquivada:false,valor_venda:420000,criado_em:'2024-02-15T00:00:00'},
    {id:'demo-obra-3',nome:'Bosque Sereno',cidade:'Olinda',status:'em_andamento',arquivada:false,valor_venda:280000,criado_em:'2024-03-01T00:00:00'},
    {id:'demo-obra-4',nome:'Alto da Serra',cidade:'Garanhuns',status:'em_andamento',arquivada:false,valor_venda:195000,criado_em:'2024-03-20T00:00:00'},
    {id:'demo-obra-5',nome:'Costa Dourada',cidade:'Porto de Galinhas',status:'concluida',arquivada:true,valor_venda:510000,criado_em:'2024-01-05T00:00:00'}
  ],
  notas_fiscais: [
    {id:'demo-nf-1',numero:'NF-1001',fornecedor:'Leroy Merlin',valor:4850.00,data:'2024-03-15',obra_id:'demo-obra-1',itens:JSON.stringify([{desc:'000001 · Cimento CP-II 50kg',qtd:20,preco:32.50,total:650},{desc:'000002 · Areia grossa m³',qtd:5,preco:95,total:475},{desc:'000016 · Gesso projetado 20kg',qtd:10,preco:35,total:350}]),criado_em:'2024-03-15T10:00:00'},
    {id:'demo-nf-2',numero:'NF-1002',fornecedor:'Telhanorte',valor:3200.00,data:'2024-04-10',obra_id:'demo-obra-2',itens:JSON.stringify([{desc:'000005 · Vergalhão CA-50 10mm',qtd:15,preco:48.50,total:727.50},{desc:'000011 · Telha fibrocimento 6mm',qtd:30,preco:52,total:1560}]),criado_em:'2024-04-10T10:00:00'},
    {id:'demo-nf-3',numero:'NF-1003',fornecedor:'C&C Construção',valor:5600.00,data:'2024-05-20',obra_id:'demo-obra-3',itens:JSON.stringify([{desc:'000007 · Fio 2,5mm rolo 100m',qtd:8,preco:145,total:1160},{desc:'000008 · Eletroduto corrugado 25mm',qtd:20,preco:28,total:560},{desc:'000009 · Disjuntor 20A bipolar',qtd:10,preco:42,total:420}]),criado_em:'2024-05-20T10:00:00'}
  ],
  lancamentos: [
    {id:'demo-lanc-0001',obra_id:'demo-obra-1',descricao:'000001 · Cimento CP-II 50kg',qtd:5,preco:32.5,total:162.5,data:'2024-03-15',obs:'NF NF-1001 · Alvenaria'},
    {id:'demo-lanc-0002',obra_id:'demo-obra-1',descricao:'000002 · Areia grossa m³',qtd:3,preco:95.0,total:285.0,data:'2024-03-15',obs:'NF NF-1001 · Alvenaria'},
    {id:'demo-lanc-0003',obra_id:'demo-obra-1',descricao:'000016 · Gesso projetado 20kg',qtd:4,preco:35.0,total:140.0,data:'2024-03-15',obs:'NF NF-1001 · Acabamento'},
    {id:'demo-lanc-0004',obra_id:'demo-obra-2',descricao:'000005 · Vergalhão CA-50 10mm',qtd:10,preco:48.5,total:485.0,data:'2024-04-10',obs:'NF NF-1002 · Estrutura'},
    {id:'demo-lanc-0005',obra_id:'demo-obra-2',descricao:'000011 · Telha fibrocimento 6mm',qtd:20,preco:52.0,total:1040.0,data:'2024-04-10',obs:'NF NF-1002 · Cobertura'},
    {id:'demo-lanc-0006',obra_id:'demo-obra-3',descricao:'000007 · Fio 2,5mm rolo 100m',qtd:5,preco:145.0,total:725.0,data:'2024-05-20',obs:'NF NF-1003 · Eletrica'},
    {id:'demo-lanc-0007',obra_id:'demo-obra-3',descricao:'000008 · Eletroduto corrugado 25mm',qtd:12,preco:28.0,total:336.0,data:'2024-05-20',obs:'NF NF-1003 · Eletrica'},
    {id:'demo-lanc-0008',obra_id:'demo-obra-4',descricao:'000003 · Brita nº 1 m³',qtd:4,preco:110.0,total:440.0,data:'2024-06-05',obs:'NF NF-1010 · Fundacao'},
    {id:'demo-lanc-0009',obra_id:'demo-obra-4',descricao:'000004 · Tijolo cerâmico 9x14x19',qtd:2,preco:680.0,total:1360.0,data:'2024-06-05',obs:'NF NF-1010 · Alvenaria'},
    {id:'demo-lanc-0010',obra_id:'demo-obra-1',descricao:'000013 · Tinta látex premium 18L',qtd:3,preco:189.0,total:567.0,data:'2024-07-12',obs:'NF NF-1020 · Pintura'},
    {id:'demo-lanc-0011',obra_id:'demo-obra-2',descricao:'000014 · Massa corrida PVA 25kg',qtd:5,preco:72.0,total:360.0,data:'2024-07-15',obs:'NF NF-1021 · Pintura'},
    {id:'demo-lanc-0012',obra_id:'demo-obra-3',descricao:'000015 · Impermeabilizante Vedacit 18L',qtd:3,preco:168.0,total:504.0,data:'2024-07-20',obs:'NF NF-1022 · Impermeabilizacao'},
    {id:'demo-lanc-0013',obra_id:'demo-obra-4',descricao:'000010 · Tubo PVC água 25mm 6m',qtd:8,preco:32.0,total:256.0,data:'2024-08-01',obs:'NF NF-1030 · Hidraulica'},
    {id:'demo-lanc-0014',obra_id:'demo-obra-1',descricao:'000019 · Argamassa colante ACIII 20kg',qtd:6,preco:29.0,total:174.0,data:'2024-08-10',obs:'NF NF-1031 · Revestimento'},
    {id:'demo-lanc-0015',obra_id:'demo-obra-2',descricao:'000006 · Vergalhão CA-50 12mm',qtd:8,preco:68.0,total:544.0,data:'2024-08-15',obs:'NF NF-1032 · Estrutura'},
    {id:'demo-lanc-0016',obra_id:'demo-obra-3',descricao:'000012 · Porcelanato 60x60 caixa',qtd:15,preco:85.0,total:1275.0,data:'2024-09-05',obs:'NF NF-1040 · Revestimento'},
    {id:'demo-lanc-0017',obra_id:'demo-obra-4',descricao:'000017 · EPI capacete obra',qtd:5,preco:28.0,total:140.0,data:'2024-09-10',obs:'NF NF-1041 · EPI'},
    {id:'demo-lanc-0018',obra_id:'demo-obra-4',descricao:'000018 · Bota de segurança cano médio',qtd:4,preco:95.0,total:380.0,data:'2024-09-10',obs:'NF NF-1041 · EPI'},
    {id:'demo-lanc-0019',obra_id:'demo-obra-1',descricao:'000020 · Argamassa chapisco 20kg',qtd:8,preco:18.0,total:144.0,data:'2024-09-20',obs:'NF NF-1042 · Revestimento'},
    {id:'demo-lanc-0020',obra_id:'demo-obra-2',descricao:'000001 · Cimento CP-II 50kg',qtd:15,preco:32.5,total:487.5,data:'2024-10-05',obs:'NF NF-1050 · Alvenaria'},
    {id:'demo-lanc-0021',obra_id:'demo-obra-3',descricao:'000007 · Fio 2,5mm rolo 100m',qtd:6,preco:145.0,total:870.0,data:'2024-10-12',obs:'NF NF-1051 · Eletrica'},
    {id:'demo-lanc-0022',obra_id:'demo-obra-4',descricao:'000005 · Vergalhão CA-50 10mm',qtd:12,preco:48.5,total:582.0,data:'2024-10-18',obs:'NF NF-1052 · Estrutura'},
    {id:'demo-lanc-0023',obra_id:'demo-obra-1',descricao:'000003 · Brita nº 1 m³',qtd:3,preco:110.0,total:330.0,data:'2024-11-02',obs:'NF NF-1060 · Fundacao'},
    {id:'demo-lanc-0024',obra_id:'demo-obra-2',descricao:'000016 · Gesso projetado 20kg',qtd:8,preco:35.0,total:280.0,data:'2024-11-10',obs:'NF NF-1061 · Acabamento'},
    {id:'demo-lanc-0025',obra_id:'demo-obra-3',descricao:'000009 · Disjuntor 20A bipolar',qtd:6,preco:42.0,total:252.0,data:'2024-11-15',obs:'NF NF-1062 · Eletrica'},
    {id:'demo-lanc-0026',obra_id:'demo-obra-4',descricao:'000013 · Tinta látex premium 18L',qtd:4,preco:189.0,total:756.0,data:'2024-12-01',obs:'NF NF-1070 · Pintura'},
    {id:'demo-lanc-0027',obra_id:'demo-obra-1',descricao:'000014 · Massa corrida PVA 25kg',qtd:6,preco:72.0,total:432.0,data:'2024-12-08',obs:'NF NF-1071 · Pintura'},
    {id:'demo-lanc-0028',obra_id:'demo-obra-2',descricao:'000015 · Impermeabilizante Vedacit 18L',qtd:2,preco:168.0,total:336.0,data:'2024-12-15',obs:'NF NF-1072 · Impermeabilizacao'},
    {id:'demo-lanc-0029',obra_id:'demo-obra-3',descricao:'000004 · Tijolo cerâmico 9x14x19',qtd:3,preco:680.0,total:2040.0,data:'2025-01-10',obs:'NF NF-1080 · Alvenaria'},
    {id:'demo-lanc-0030',obra_id:'demo-obra-4',descricao:'000010 · Tubo PVC água 25mm 6m',qtd:6,preco:32.0,total:192.0,data:'2025-01-18',obs:'NF NF-1081 · Hidraulica'},
    {id:'demo-lanc-0031',obra_id:'demo-obra-1',descricao:'000012 · Porcelanato 60x60 caixa',qtd:10,preco:85.0,total:850.0,data:'2025-01-25',obs:'NF NF-1082 · Revestimento'},
    {id:'demo-lanc-0032',obra_id:'demo-obra-2',descricao:'000020 · Argamassa chapisco 20kg',qtd:10,preco:18.0,total:180.0,data:'2025-02-05',obs:'NF NF-1090 · Revestimento'},
    {id:'demo-lanc-0033',obra_id:'demo-obra-3',descricao:'000002 · Areia grossa m³',qtd:4,preco:95.0,total:380.0,data:'2025-02-12',obs:'NF NF-1091 · Alvenaria'},
    {id:'demo-lanc-0034',obra_id:'demo-obra-4',descricao:'000019 · Argamassa colante ACIII 20kg',qtd:8,preco:29.0,total:232.0,data:'2025-02-20',obs:'NF NF-1092 · Revestimento'},
    {id:'demo-lanc-0035',obra_id:'demo-obra-1',descricao:'000006 · Vergalhão CA-50 12mm',qtd:6,preco:68.0,total:408.0,data:'2025-03-01',obs:'NF NF-1100 · Estrutura'}
  ],
  repasses_cef: [
    {id:'demo-rep-1',obra_id:'demo-obra-1',medicao_numero:1,valor:45000.00,data_credito:'2024-04-15',observacao:'1ª medição aprovada',tipo:'pls',criado_em:'2024-04-15T10:00:00'},
    {id:'demo-rep-2',obra_id:'demo-obra-1',medicao_numero:2,valor:62000.00,data_credito:'2024-06-20',observacao:'2ª medição - estrutura',tipo:'pls',criado_em:'2024-06-20T10:00:00'},
    {id:'demo-rep-3',obra_id:'demo-obra-1',medicao_numero:3,valor:38500.00,data_credito:'2024-09-10',observacao:'3ª medição - alvenaria',tipo:'pls',criado_em:'2024-09-10T10:00:00'},
    {id:'demo-rep-4',obra_id:'demo-obra-2',medicao_numero:1,valor:55000.00,data_credito:'2024-05-22',observacao:'1ª medição aprovada',tipo:'pls',criado_em:'2024-05-22T10:00:00'},
    {id:'demo-rep-5',obra_id:'demo-obra-2',medicao_numero:2,valor:72000.00,data_credito:'2024-08-15',observacao:'2ª medição - cobertura',tipo:'pls',criado_em:'2024-08-15T10:00:00'},
    {id:'demo-rep-6',obra_id:'demo-obra-3',medicao_numero:1,valor:48000.00,data_credito:'2024-07-05',observacao:'1ª medição aprovada',tipo:'pls',criado_em:'2024-07-05T10:00:00'},
    {id:'demo-rep-7',obra_id:'demo-obra-3',medicao_numero:2,valor:51000.00,data_credito:'2024-10-18',observacao:'2ª medição - elétrica',tipo:'pls',criado_em:'2024-10-18T10:00:00'},
    {id:'demo-rep-8',obra_id:'demo-obra-4',medicao_numero:1,valor:35000.00,data_credito:'2024-08-30',observacao:'1ª medição aprovada',tipo:'pls',criado_em:'2024-08-30T10:00:00'},
    {id:'demo-rep-9',obra_id:'demo-obra-1',medicao_numero:4,valor:41000.00,data_credito:'2024-12-05',observacao:'4ª medição - acabamento',tipo:'pls',criado_em:'2024-12-05T10:00:00'},
    {id:'demo-rep-10',obra_id:'demo-obra-2',medicao_numero:3,valor:43000.00,data_credito:'2024-11-20',observacao:'3ª medição - pintura',tipo:'pls',criado_em:'2024-11-20T10:00:00'},
    {id:'demo-rep-11',obra_id:'demo-obra-1',medicao_numero:0,valor:25000.00,data_credito:'2024-03-01',observacao:'Entrada do cliente - sinal',tipo:'entrada',criado_em:'2024-03-01T10:00:00'},
    {id:'demo-rep-12',obra_id:'demo-obra-2',medicao_numero:0,valor:30000.00,data_credito:'2024-04-10',observacao:'Entrada do cliente',tipo:'entrada',criado_em:'2024-04-10T10:00:00'},
    {id:'demo-rep-13',obra_id:'demo-obra-3',medicao_numero:0,valor:20000.00,data_credito:'2024-06-01',observacao:'Sinal do comprador',tipo:'entrada',criado_em:'2024-06-01T10:00:00'},
    {id:'demo-rep-14',obra_id:'demo-obra-4',medicao_numero:0,valor:15000.00,data_credito:'2024-07-15',observacao:'Entrada parcial',tipo:'entrada',criado_em:'2024-07-15T10:00:00'}
  ],
  distribuicoes: [],
  entradas_diretas: [],
  materiais: [
    {id:'demo-mat-1',codigo:'000001',nome:'Cimento CP-II 50kg',unidade:'saco',saldo:45,preco_medio:32.5,categoria:'alvenaria',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-2',codigo:'000002',nome:'Areia grossa m³',unidade:'m³',saldo:12,preco_medio:95.0,categoria:'alvenaria',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-3',codigo:'000003',nome:'Brita nº 1 m³',unidade:'m³',saldo:8,preco_medio:110.0,categoria:'alvenaria',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-4',codigo:'000004',nome:'Tijolo cerâmico 9x14x19',unidade:'ml',saldo:3,preco_medio:680.0,categoria:'alvenaria',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-5',codigo:'000005',nome:'Vergalhão CA-50 10mm',unidade:'barra',saldo:22,preco_medio:48.5,categoria:'aco',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-6',codigo:'000006',nome:'Vergalhão CA-50 12mm',unidade:'barra',saldo:15,preco_medio:68.0,categoria:'aco',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-7',codigo:'000007',nome:'Fio 2,5mm rolo 100m',unidade:'rolo',saldo:8,preco_medio:145.0,categoria:'eletrica',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-8',codigo:'000008',nome:'Eletroduto corrugado 25mm',unidade:'rolo',saldo:20,preco_medio:28.0,categoria:'eletrica',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-9',codigo:'000009',nome:'Disjuntor 20A bipolar',unidade:'un',saldo:12,preco_medio:42.0,categoria:'eletrica',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-10',codigo:'000010',nome:'Tubo PVC água 25mm 6m',unidade:'barra',saldo:18,preco_medio:32.0,categoria:'hidraulica',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-11',codigo:'000011',nome:'Telha fibrocimento 6mm',unidade:'un',saldo:35,preco_medio:52.0,categoria:'cobertura',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-12',codigo:'000012',nome:'Porcelanato 60x60 caixa',unidade:'cx',saldo:28,preco_medio:85.0,categoria:'rev_cer',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-13',codigo:'000013',nome:'Tinta látex premium 18L',unidade:'gl',saldo:6,preco_medio:189.0,categoria:'pintura',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-14',codigo:'000014',nome:'Massa corrida PVA 25kg',unidade:'saco',saldo:10,preco_medio:72.0,categoria:'pintura',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-15',codigo:'000015',nome:'Impermeabilizante Vedacit 18L',unidade:'gl',saldo:4,preco_medio:168.0,categoria:'impermeab',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-16',codigo:'000016',nome:'Gesso projetado 20kg',unidade:'saco',saldo:25,preco_medio:35.0,categoria:'gesso',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-17',codigo:'000017',nome:'Capacete obra classe A',unidade:'un',saldo:8,preco_medio:28.0,categoria:'epi',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-18',codigo:'000018',nome:'Bota de segurança cano médio',unidade:'par',saldo:5,preco_medio:95.0,categoria:'epi',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-19',codigo:'000019',nome:'Argamassa colante ACIII 20kg',unidade:'saco',saldo:30,preco_medio:29.0,categoria:'rev_arg',criado_em:'2024-01-01T00:00:00'},
    {id:'demo-mat-20',codigo:'000020',nome:'Argamassa chapisco 20kg',unidade:'saco',saldo:20,preco_medio:18.0,categoria:'rev_arg',criado_em:'2024-01-01T00:00:00'}
  ]
};

function _demoFilter(table, q) {
  const rows = DEMO_DATA[table] || [];
  let result = [...rows];
  const eqs = [...(q||'').matchAll(/[?&](\w+)=eq\.([^&]+)/g)];
  for (const [,col,val] of eqs) result = result.filter(r => String(r[col]) === decodeURIComponent(val));
  if (q && q.includes('arquivada=is.false')) result = result.filter(r => !r.arquivada);
  if (q && q.includes('arquivada=is.true'))  result = result.filter(r =>  r.arquivada);
  if (q && q.includes('order=nome'))         result.sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
  if (q && q.includes('order=codigo'))       result.sort((a,b) => (a.codigo||'').localeCompare(b.codigo||''));
  if (q && q.includes('order=data.desc'))    result.sort((a,b) => (b.data||b.criado_em||'').localeCompare(a.data||a.criado_em||''));
  if (q && q.includes('order=criado_em.desc')) result.sort((a,b) => (b.criado_em||'').localeCompare(a.criado_em||''));
  const lim = q && q.match(/limit=(\d+)/); if (lim) result = result.slice(0, parseInt(lim[1]));
  return result;
}

let _demoBannerTimer = null;

function entrarModoDemo() {
  MODO_DEMO = true;
  USUARIOS.length = 0;
  DEMO_DATA.usuarios.forEach(u => USUARIOS.push(u));
  usuarioAtual = DEMO_DATA.usuarios[0];
  try { localStorage.removeItem('edr_session'); } catch(e) {}
  const badge = document.getElementById('demo-badge');
  if (badge) badge.classList.remove('hidden');
  entrarNoApp();
  if (_demoBannerTimer) clearTimeout(_demoBannerTimer);
  _demoBannerTimer = setTimeout(() => {
    if (!MODO_DEMO) return; // Saiu do demo antes do timer
    if (!document.getElementById('demo-banner')) {
      const b = document.createElement('div');
      b.id = 'demo-banner';
      b.innerHTML = '&#127916; <strong>MODO DEMO</strong> &mdash; dados fictícios &nbsp;&middot;&nbsp; 4 obras residenciais &nbsp;&middot;&nbsp; nenhuma alteração é salva';
      b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0d2b16;color:#7bed9f;text-align:center;padding:7px 12px;font-size:11px;letter-spacing:1px;z-index:201;border-top:1px solid rgba(34,197,94,0.3);font-family:inherit;';
      document.body.appendChild(b);
      // Empurra conteúdo pra não ficar atrás do banner
      const mc = document.getElementById('main-content');
      if (mc) mc.style.paddingBottom = (window.innerWidth <= 768 ? '110px' : '40px');
    }
    _demoBannerTimer = null;
  }, 600);
}

