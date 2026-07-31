const crypto = require('crypto');

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const developerAccessCode = 'TESTE-ACCESS-CODE-12345';

const encrypted = crypto.publicEncrypt(
  { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(developerAccessCode, 'utf8')
);
const base64Result = encrypted.toString('base64');
console.log('Criptografado + Base64 (primeiros 50 chars):', base64Result.slice(0, 50) + '...');
console.log('Tamanho total:', base64Result.length, 'caracteres');

const decrypted = crypto.privateDecrypt(
  { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from(base64Result, 'base64')
);
console.log('Decriptado de volta:', decrypted.toString('utf8'));
console.log(decrypted.toString('utf8') === developerAccessCode ? 'TESTE PASSOU — RSA-PKCS1 confirmado' : 'TESTE FALHOU');
