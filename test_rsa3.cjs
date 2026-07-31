const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const developerAccessCode = 'TESTE-ACCESS-CODE-12345';

const encrypted = crypto.publicEncrypt(
  { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(developerAccessCode, 'utf8')
);
const base64Result = encrypted.toString('base64');

console.log('Codigo original:', developerAccessCode);
console.log('Tamanho da chave usada: 2048 bits');
console.log('Resultado criptografado (Base64), tamanho:', base64Result.length, 'caracteres');
console.log('Primeiros 60 chars:', base64Result.slice(0, 60));
console.log('RESULTADO: SUCESSO — a criptografia RSA-PKCS1 (so encrypt, que e o que precisamos) funciona normal.');
