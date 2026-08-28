const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const migration = fs.readFileSync(
  path.join(raiz, 'sql', 'diarias-migration-d-admin-pix-pdf.sql'),
  'utf8'
);
const diarias = fs.readFileSync(path.join(raiz, 'js', 'edr-v2-diarias.js'), 'utf8');
const rpcPublica = fs.readFileSync(path.join(raiz, 'sql', 'diarias-migration-a.sql'), 'utf8');
const pixBRCode = require(path.join(raiz, 'js', 'pix-brcode.js'));

test('roster do admin entrega os dados que o PDF usa para pagamento', () => {
  assert.match(migration, /returns table\s*\([\s\S]*nome_completo text[\s\S]*chave_pix text/i);
  assert.match(migration, /select[\s\S]*f\.nome_completo[\s\S]*f\.chave_pix/i);
  assert.match(diarias, /const pix = \(cad\?\.chave_pix \|\| ['"]—['"]\)/);
  assert.match(diarias, /doc\.text\(['"]CHAVE PIX['"]/);
});

test('PIX continua restrito ao admin e ao tenant autenticado', () => {
  assert.match(migration, /public\.auth_user_role\(\) <> ['"]admin['"]/i);
  assert.match(migration, /f\.company_id = v_company/i);
  assert.match(migration, /revoke all on function public\.diarias_funcionarios_admin\(\) from public/i);
  assert.match(migration, /revoke all on function public\.diarias_funcionarios_admin\(\) from anon/i);

  const blocoPublico = rpcPublica.match(
    /create or replace function diarias_funcionarios_publico\(\)[\s\S]*?grant execute on function diarias_funcionarios_publico\(\) to authenticated;/i
  );
  assert.ok(blocoPublico, 'definicao da RPC publica deve existir');
  assert.doesNotMatch(blocoPublico[0], /chave_pix|nome_completo|diaria numeric/i);
});

test('migration e atomica e restaura apenas o grant autenticado', () => {
  assert.match(migration, /begin;[\s\S]*commit;/i);
  assert.match(migration, /drop function if exists public\.diarias_funcionarios_admin\(\)/i);
  assert.match(migration, /grant execute on function public\.diarias_funcionarios_admin\(\) to authenticated/i);
});

test('gerador BR Code normaliza CPF, telefone, email e chave aleatoria', () => {
  assert.equal(pixBRCode.normalizarChave('106.391.174-57'), '10639117457');
  assert.equal(pixBRCode.normalizarChave('87996611349'), '+5587996611349');
  assert.equal(pixBRCode.normalizarChave('+55 (87) 99661-1349'), '+5587996611349');
  assert.equal(pixBRCode.normalizarChave('PIX@EXEMPLO.COM'), 'pix@exemplo.com');
  assert.equal(
    pixBRCode.normalizarChave('123e4567-e12b-12d1-a456-426655440000'),
    '123e4567-e12b-12d1-a456-426655440000'
  );
});

test('CRC16 confere com o exemplo oficial do Manual de Padroes do Pix', () => {
  const payloadSemCRC = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304';
  assert.equal(pixBRCode.crc16(payloadSemCRC), '1D3D');
});

test('payload Pix leva chave normalizada, valor fixo, txid neutro e CRC valido', () => {
  const payload = pixBRCode.montarPayload({
    chave: '106.391.174-57',
    nome: 'Anderson Inacio da Silva',
    valor: 1700,
    cidade: 'NAO INFORMADO',
    txid: '***'
  });
  assert.match(payload, /^000201/);
  assert.match(payload, /0014br\.gov\.bcb\.pix011110639117457/);
  assert.match(payload, /54071700\.00/);
  assert.match(payload, /62070503\*\*\*/);
  assert.equal(payload.slice(-4), pixBRCode.crc16(payload.slice(0, -4)));
});

test('PDF vincula QR ao funcionario e mantem conferencia manual do pagamento', () => {
  assert.match(diarias, /DADOS PARA PAGAMENTO PIX/);
  assert.match(diarias, /primeiroNome \+ ['"] · ['"] \+ valorFormatado/);
  assert.match(diarias, /doc\.rect\(pgX\[4\][\s\S]*?, 6, 6\)/);
  assert.match(diarias, /CONFIRA O NOME DO FAVORECIDO E O VALOR/);
  assert.match(diarias, /PAGAR EM DINHEIRO/);
  assert.match(diarias, /Pagina ['"] \+ pagina \+ ['"] de ['"] \+ totalPaginas/);
});
