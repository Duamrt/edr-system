// ══════════════════════════════════════════
// CRÉDITOS / SETUP
// ══════════════════════════════════════════
const TABELA_CREDITOS = [
  {cat:'Cimento, areia, brita, blocos',credito:true},{cat:'Ferro, vergalhão, tela soldada',credito:true},
  {cat:'Madeira (caixaria, formas, estrutura)',credito:true},{cat:'Argamassa, reboco, cal, gesso',credito:true},
  {cat:'Tinta, massa corrida, textura',credito:true},{cat:'Piso, cerâmica, porcelanato',credito:true},
  {cat:'Telhas, calhas, rufos',credito:true},{cat:'Portas, janelas, esquadrias',credito:true},
  {cat:'Fechaduras, maçanetas',credito:true},{cat:'Pontaletes / escoramento',credito:true},
  {cat:'Concreto usinado / laje / pré-moldados',credito:true},{cat:'Tubos, conexões, material hidráulico',credito:true},
  {cat:'Fios, cabos, material elétrico',credito:true},{cat:'Disjuntor, quadro elétrico',credito:true},
  {cat:'Luminárias, painel LED',credito:true},{cat:'Mão de obra (serviços)',credito:true},
  {cat:'Aluguel de equipamentos',credito:true},{cat:'EPI e segurança do trabalho',credito:true},
  {cat:'Frete de materiais (destacado na NF)',credito:true},{cat:'——————',credito:null},
  {cat:'Combustível',credito:false},{cat:'Alimentação e copa',credito:false},
  {cat:'Material de limpeza',credito:false},{cat:'Ferramentas (uso próprio)',credito:false},
  {cat:'Mobiliário e administrativo',credito:false},{cat:'Multas e encargos financeiros',credito:false},
];
function renderTabelaCreditos() { document.getElementById('creditos-tbody').innerHTML = TABELA_CREDITOS.map(c => { if (c.credito === null) return `<tr><td colspan="2" style="color:#94a3b8;font-size:11px;padding:4px 10px;">${c.cat}</td></tr>`; return `<tr><td>${c.cat}</td><td><span class="${c.credito?'badge-sim':'badge-nao'}">${c.credito?'✓ SIM':'✗ NÃO'}</span></td></tr>`; }).join(''); }

