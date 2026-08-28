// Gerador local de payload Pix BR Code (QR estatico).
// Nao envia chave, nome ou valor para servicos externos.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PixBRCode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function campo(id, valor) {
    const texto = String(valor);
    if (texto.length > 99) throw new Error('Campo Pix excede 99 caracteres.');
    return id + String(texto.length).padStart(2, '0') + texto;
  }

  function somenteTextoBrCode(valor, limite, fallback) {
    const texto = String(valor || fallback || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9 $%*+\-./:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return (texto || String(fallback || '')).substring(0, limite);
  }

  function cpfValido(digitos) {
    if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += Number(digitos[i]) * (10 - i);
    let verificador = 11 - (soma % 11);
    if (verificador >= 10) verificador = 0;
    if (verificador !== Number(digitos[9])) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += Number(digitos[i]) * (11 - i);
    verificador = 11 - (soma % 11);
    if (verificador >= 10) verificador = 0;
    return verificador === Number(digitos[10]);
  }

  function normalizarChave(chave) {
    const original = String(chave || '').trim();
    if (!original) throw new Error('Chave Pix nao informada.');

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(original)) return original.toLowerCase();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(original)) {
      return original.toLowerCase();
    }

    const digitos = original.replace(/\D/g, '');
    if (/^\+55\d{10,11}$/.test(original.replace(/[\s()-]/g, ''))) return '+' + digitos;
    if (digitos.length === 11 && (/[.\-]/.test(original) || cpfValido(digitos))) return digitos;
    if (digitos.length === 14) return digitos;
    if (digitos.length === 10 || digitos.length === 11) return '+55' + digitos;

    if (original.length <= 77 && /^[A-Za-z0-9+_.@-]+$/.test(original)) return original;
    throw new Error('Formato de chave Pix invalido.');
  }

  function crc16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xFFFF;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  function montarPayload({ chave, nome, valor, cidade, txid }) {
    const chaveNormalizada = normalizarChave(chave);
    const valorNumero = Number(valor);
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) throw new Error('Valor Pix invalido.');

    const contaPix = campo('00', 'br.gov.bcb.pix') + campo('01', chaveNormalizada);
    const identificador = somenteTextoBrCode(txid || '***', 25, '***') || '***';
    let payload = '';
    payload += campo('00', '01');
    payload += campo('26', contaPix);
    payload += campo('52', '0000');
    payload += campo('53', '986');
    payload += campo('54', valorNumero.toFixed(2));
    payload += campo('58', 'BR');
    payload += campo('59', somenteTextoBrCode(nome, 25, 'RECEBEDOR'));
    payload += campo('60', somenteTextoBrCode(cidade, 15, 'NAO INFORMADO'));
    payload += campo('62', campo('05', identificador));
    payload += '6304';
    return payload + crc16(payload);
  }

  return { montarPayload, normalizarChave, crc16 };
});
