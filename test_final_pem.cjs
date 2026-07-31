const crypto = require('crypto');

function normalizePemKey(pem) {
  const hasLiteralBackslashN = pem.indexOf('\\n') !== -1;
  const hasRealNewlineBeforeFooter = pem.indexOf('\n-----') !== -1;
  if (hasLiteralBackslashN && !hasRealNewlineBeforeFooter) {
    return pem.split('\\n').join('\n');
  }
  return pem;
}

function encryptAccessCode(accessCode, publicKeyPem) {
  const normalizedKey = normalizePemKey(publicKeyPem);
  const encrypted = crypto.publicEncrypt(
    { key: normalizedKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(accessCode, 'utf8'),
  );
  return encrypted.toString('base64');
}

const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

console.log('=== Cenario 1: chave PEM normal (quebras de linha reais) ===');
try {
  const r1 = encryptAccessCode('MEU-ACCESS-CODE', publicKey);
  console.log('OK, tamanho:', r1.length);
} catch (e) {
  console.log('FALHOU:', e.message);
}

console.log('=== Cenario 2: chave PEM com \\\\n literal (como pode vir de um secret mal colado) ===');
const brokenKey = publicKey.split('\n').join('\\n');
try {
  const r2 = encryptAccessCode('MEU-ACCESS-CODE', brokenKey);
  console.log('OK (normalizado automaticamente), tamanho:', r2.length);
} catch (e) {
  console.log('FALHOU:', e.message);
}
