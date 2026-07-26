import { testRead01Capability } from './dist/src/lib/capability-runtime/tests/Read01Test.js';

console.log('🚀 Iniciando teste funcional de read-01...\n');

try {
  const results = await testRead01Capability();
  
  console.log('📋 RESULTADO DOS TESTES\n');
  console.log('═'.repeat(80));
  
  let passed = 0;
  let failed = 0;
  
  results.forEach((r) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} — Teste ${r.criterion}: ${r.name}`);
    console.log(`    Duração: ${r.durationMs}ms`);
    if (r.detail) console.log(`    Detalhe: ${r.detail}`);
    if (r.error) console.log(`    Erro: ${r.error}`);
    if (r.observation) console.log(`    Observação: ${r.observation}`);
    console.log();
    
    if (r.passed) passed++;
    else failed++;
  });
  
  console.log('═'.repeat(80));
  console.log(`\n📊 RESUMO: ${passed}/${results.length} testes passaram`);
  
  if (failed === 0) {
    console.log('\n🎉 SUCESSO! read-01 está totalmente funcional!\n');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} teste(s) falharam. Ver detalhes acima.\n`);
    process.exit(1);
  }
} catch (err) {
  console.error('❌ Erro ao executar testes:', err.message);
  console.error(err.stack);
  process.exit(1);
}
