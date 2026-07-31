const crypto = require('crypto');

try {
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
  console.log('PASSO 1 - Criptografado OK, tamanho base64:', base64Result.length);

  const decrypted = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    Buffer.from(base64Result, 'base64')
  );
  console.log('PASSO 2 - Decriptado:', decrypted.toString('utf8'));
  console.log('RESULTADO:', decrypted.toString('utf8') === developerAccessCode ? 'TESTE PASSOU' : 'TESTE FALHOU');
} catch (err) {
  console.error('ERRO:', err.message);
}
