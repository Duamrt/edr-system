'use strict';
// Exclusivo para homologacao LOCAL. Nunca aceita URL remota ou projeto vinculado.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PROJECT = 'edr-caixa-qa-20261006';
const MARKER = 'EDR_CAIXA_AUTH_LOCAL_ONLY';
const REPO = path.resolve(__dirname, '../..');
const inside = (file, directory) => {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};
function insist(ok, message) { if (!ok) throw new Error(message); }
function configFromEnvironment(env = process.env) {
  insist(env.EDR_CAIXA_AUTH_LOCAL_DIR && env.EDR_CAIXA_AUTH_LOCAL_STATUS && env.EDR_POSTGRES_BIN,
    'Defina diretorio local, status JSON PRIVADO externo e binarios PostgreSQL existentes.');
  const localDir = path.resolve(env.EDR_CAIXA_AUTH_LOCAL_DIR);
  const statusFile = path.resolve(env.EDR_CAIXA_AUTH_LOCAL_STATUS);
  const expectedDir = path.resolve(REPO, '../caixa-auth-local');
  insist(localDir.toLowerCase() === expectedDir.toLowerCase(), 'Diretorio deve ser a stack caixa-auth-local autorizada ao lado da copia.');
  insist(!inside(localDir, REPO) && !inside(statusFile, REPO), 'Infraestrutura/status privado devem ficar fora do repositorio.');
  insist(inside(statusFile, localDir), 'Status privado deve pertencer ao diretorio local autorizado.');
  const config = fs.readFileSync(path.join(localDir, 'supabase/config.toml'), 'utf8');
  insist(/^project_id\s*=\s*"edr-caixa-qa-20261006"\s*$/m.test(config), 'Identidade do projeto local nao confere.');
  insist(!fs.existsSync(path.join(localDir, 'supabase/.temp/project-ref')), 'Projeto vinculado remoto recusado.');
  let values, api, db;
  try {
    values = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    api = new URL(values.API_URL);
    db = new URL(values.DB_URL);
  } catch { throw new Error('Status privado/URLs invalidos; valores e segredos omitidos.'); }
  insist(api.protocol === 'http:' && api.hostname === '127.0.0.1' && api.port === '55321' && api.pathname === '/' &&
    !api.username && !api.password && !api.search && !api.hash, 'API deve ser exclusivamente http://127.0.0.1:55321.');
  insist(['postgresql:', 'postgres:'].includes(db.protocol) && db.hostname === '127.0.0.1' && db.port === '55322' &&
    db.pathname === '/postgres' && decodeURIComponent(db.username) === 'postgres' && !db.search && !db.hash,
    'Banco deve ser exclusivamente PostgreSQL postgres em 127.0.0.1:55322.');
  insist(typeof values.ANON_KEY === 'string' && values.ANON_KEY.length > 20 &&
    typeof values.SERVICE_ROLE_KEY === 'string' && values.SERVICE_ROLE_KEY.length > 20, 'Chaves locais ausentes no status privado.');
  const psql = path.join(env.EDR_POSTGRES_BIN, process.platform === 'win32' ? 'psql.exe' : 'psql');
  insist(fs.existsSync(psql), 'psql existente nao encontrado.');
  return { localDir, api: api.origin, db, anon: values.ANON_KEY, service: values.SERVICE_ROLE_KEY, psql };
}
class LocalSupabase {
  constructor(config) {
    insist(config.api === 'http://127.0.0.1:55321' && config.db.hostname === '127.0.0.1' && config.db.port === '55322',
      'Runtime aceita somente endpoints locais fixados.');
    this.config = config;
    this.origin = 'http://127.0.0.1:55321';
    this.privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edr-caixa-auth-private-'));
    this.passfile = path.join(this.privateDir, 'pgpass');
    const escape = text => text.replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    const password = decodeURIComponent(config.db.password);
    insist(!/[\r\n]/.test(password), 'Formato de senha local invalido; valor omitido.');
    fs.writeFileSync(this.passfile, `127.0.0.1:55322:postgres:postgres:${escape(password)}\n`, { mode: 0o600 });
    this.pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
    Object.assign(this.pgEnv, { PGHOST: '127.0.0.1', PGPORT: '55322', PGDATABASE: 'postgres', PGUSER: 'postgres',
      PGPASSFILE: this.passfile, PGAPPNAME: PROJECT });
  }
  sql(statement) {
    try {
      return execFileSync(this.config.psql, ['-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate'],
        { input: statement, encoding: 'utf8', windowsHide: true, timeout: 30000, env: this.pgEnv,
          stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024 }).trim();
    } catch (error) {
      // O stderr pode conter SQL/credenciais de conexao: nao o propaga.
      const code = String(error.stderr || '').match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})(?:\s|$)/)?.[1];
      throw new Error('SQL_LOCAL_FALHOU' + (code ? ' (' + code + ')' : '') + '; detalhes privados nao foram publicados.');
    }
  }
  json(statement) { return JSON.parse(this.sql(statement).split(/\r?\n/).at(-1)); }
  marker() {
    const marker = this.sql("select project_id from edr_caixa_qa.marker where id=1;");
    insist(marker === PROJECT, 'Marcador de banco QA local ausente/incorreto.');
  }
  async request(route, { token, admin = false, method = 'GET', body, anonymous = false, noKey = false } = {}) {
    insist(route.startsWith('/auth/v1/') || route.startsWith('/rest/v1/'), 'Rota nao permitida no ensaio local.');
    const headers = { 'Content-Type': 'application/json' };
    if (!noKey) headers.apikey = admin ? this.config.service : this.config.anon;
    if (admin) headers.Authorization = 'Bearer ' + this.config.service;
    else if (token) headers.Authorization = 'Bearer ' + token;
    else if (anonymous) headers.Authorization = 'Bearer ' + this.config.anon;
    let response;
    try {
      response = await fetch(this.origin + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(20000) });
    } catch { throw new Error('HTTP_LOCAL_FALHOU; rota/segredos omitidos.'); }
    let result = null;
    const text = await response.text();
    if (text) { try { result = JSON.parse(text); } catch { result = null; } }
    // Resposta permanece em memoria. Chamadores registram somente status/codigos.
    return { status: response.status, ok: response.ok, body: result,
      code: typeof result?.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(result.code) ? result.code : null };
  }
  rpc(name, token, body = {}) {
    insist(['caixa_estado', 'caixa_registrar'].includes(name), 'RPC fora do escopo recusada.');
    return this.request('/rest/v1/rpc/' + name, { token, method: 'POST', body });
  }
  dispose() {
    // Apenas o diretorio exato criado pelo harness; nunca remove stack/dados.
    insist(inside(this.privateDir, os.tmpdir()) && path.basename(this.privateDir).startsWith('edr-caixa-auth-private-'),
      'Diretorio temporario privado fora do escopo.');
    fs.rmSync(this.privateDir, { recursive: true, force: true });
  }
}
module.exports = { LocalSupabase, configFromEnvironment, PROJECT, MARKER, REPO, inside };
