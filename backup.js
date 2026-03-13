#!/usr/bin/env node
// ══════════════════════════════════════════
// EDR SYSTEM — Backup da Base de Dados
// Exporta todas as tabelas do Supabase para JSON
// ══════════════════════════════════════════
// USO:  node backup.js
// SAIDA: backups/ (local) + Google Drive (nuvem)

const https = require('https');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mepzoxoahpwcvvlymlfh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z9E8KLU8ZIMcWjD-bMG5gg_eM585qWq';

// Pastas de backup
const BACKUP_LOCAL = path.join(__dirname, 'backups');
const BACKUP_DRIVE = 'J:\\Meu Drive\\EDR Backups';

// Manter backups dos ultimos 30 dias
const DIAS_RETENCAO = 30;

const TABELAS = [
  'notas_fiscais',
  'lancamentos',
  'distribuicoes',
  'entradas_diretas',
  'ajustes_estoque',
  'materiais',
  'obras',
  'usuarios',
  'diarias',
  'diarias_quinzenas',
  'diarias_funcionarios',
  'diarias_extras',
  'repasses_cef',
  'obras_adicionais',
  'adicional_pagamentos'
];

function fetchTabela(tabela) {
  return new Promise((resolve) => {
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?select=*&order=criado_em.desc&limit=10000`;
    const options = {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    https.get(url, options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(res.statusCode === 200 && Array.isArray(json) ? json : []);
        } catch(e) { resolve([]); }
      });
      res.on('error', () => resolve([]));
    }).on('error', () => resolve([]));
  });
}

function copiarPasta(origem, destino) {
  try {
    fs.mkdirSync(destino, { recursive: true });
    for (const arquivo of fs.readdirSync(origem)) {
      fs.copyFileSync(path.join(origem, arquivo), path.join(destino, arquivo));
    }
    return true;
  } catch(e) { return false; }
}

function limparAntigos(pastaBase) {
  try {
    if (!fs.existsSync(pastaBase)) return 0;
    const limite = Date.now() - (DIAS_RETENCAO * 24 * 60 * 60 * 1000);
    let removidos = 0;
    for (const nome of fs.readdirSync(pastaBase)) {
      const caminho = path.join(pastaBase, nome);
      const stat = fs.statSync(caminho);
      if (stat.isDirectory() && stat.mtimeMs < limite) {
        fs.rmSync(caminho, { recursive: true, force: true });
        removidos++;
      }
    }
    return removidos;
  } catch(e) { return 0; }
}

async function main() {
  const agora = new Date();
  const timestamp = agora.toISOString().slice(0,16).replace('T','_').replace(':','h');
  const dirLocal = path.join(BACKUP_LOCAL, timestamp);

  fs.mkdirSync(dirLocal, { recursive: true });

  console.log('');
  console.log('  ══════════════════════════════════════');
  console.log('  EDR SYSTEM — BACKUP DA BASE DE DADOS');
  console.log('  ══════════════════════════════════════');
  console.log(`  Data: ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR')}`);
  console.log('');

  // 1. Exportar tabelas
  let totalRegistros = 0;
  const resumo = [];

  for (const tabela of TABELAS) {
    process.stdout.write(`  ${tabela.padEnd(25)} `);
    const dados = await fetchTabela(tabela);
    fs.writeFileSync(path.join(dirLocal, `${tabela}.json`), JSON.stringify(dados, null, 2), 'utf8');
    const qtd = dados.length;
    totalRegistros += qtd;
    resumo.push({ tabela, registros: qtd });
    console.log(qtd > 0 ? `${qtd} registros` : `vazia`);
  }

  // Salvar resumo
  fs.writeFileSync(path.join(dirLocal, '_resumo.json'), JSON.stringify({
    data: agora.toISOString(),
    total_registros: totalRegistros,
    tabelas: resumo
  }, null, 2), 'utf8');

  console.log('');
  console.log(`  TOTAL: ${totalRegistros} registros`);
  console.log(`  Local: ${dirLocal}`);

  // 2. Copiar para Google Drive
  const dirDrive = path.join(BACKUP_DRIVE, timestamp);
  const copiou = copiarPasta(dirLocal, dirDrive);
  if (copiou) {
    console.log(`  Drive: ${dirDrive}`);
  } else {
    console.log('  Drive: NAO ENCONTRADO (backup salvo apenas local)');
  }

  // 3. Limpar backups antigos (>30 dias)
  const removLocal = limparAntigos(BACKUP_LOCAL);
  const removDrive = limparAntigos(BACKUP_DRIVE);
  if (removLocal + removDrive > 0) {
    console.log(`  Limpeza: ${removLocal + removDrive} backup(s) antigo(s) removido(s)`);
  }

  console.log('');
  console.log('  ══════════════════════════════════════');
  console.log('  BACKUP CONCLUIDO COM SUCESSO!');
  console.log('  ══════════════════════════════════════');
  console.log('');
}

main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
