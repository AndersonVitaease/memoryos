const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});
const encrypted = crypto.publicEncrypt(
  { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from('teste-abc', 'utf8')
);
console.log('ANTES DO DECRYPT');
try {
  const decrypted = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    encrypted
  );
  console.log('DEPOIS DO DECRYPT OK:', decrypted.toString('utf8'));
} catch (err) {
  console.log('ERRO NO DECRYPT:', err.message);
  console.log('CODE:', err.code);
}
