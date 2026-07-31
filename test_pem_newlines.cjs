const crypto = require('crypto');
const { publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

console.log('=== Chave PEM normal (com quebras de linha reais) ===');
console.log('Tamanho:', publicKey.length, 'linhas:', publicKey.split('\n').length);

// Simula o que aconteceria se a chave fosse colada com \n LITERAL (texto)
// em vez de quebra de linha real, como pode acontecer ao colar num campo
// de secret de uma linha so
const keyWithLiteralNewlines = publicKey.replace(/\n/g, '\\n');
console.log('\n=== Testando se funciona convertendo \\n literal de volta pra quebra real ===');
const keyFixed = keyWithLiteralNewlines.replace(/\\n/g, '\n');
const encrypted = crypto.publicEncrypt(
  { key: keyFixed, padding: crypto.constants.RSA_PKCS1_PADDING },
  Buffer.from('teste', 'utf8')
);
console.log('Funcionou apos converter \\n literal de volta: SIM, tamanho:', encrypted.length);
