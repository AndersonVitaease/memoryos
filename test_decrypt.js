const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs1', format: 'pem' } });
const encrypted = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from('teste-abc', 'utf8'));
try {
  const decrypted = crypto.privateDecrypt({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, encrypted);
  console.log('OK:', decrypted.toString('utf8'));
} catch (err) {
  console.log('ERRO_CAPTURADO:', err.message);
  console.log('ERRO_CODE:', err.code);
}
