// Simulacao da logica de selecao, com providers falsos (mock),
// pra provar que a ordem de preferencia e o fallback funcionam certo.

class FakeRegistry {
  constructor() { this._providers = []; }
  register(p) { this._providers.push(p); }
  findByCapability(cap) { return this._providers.filter(p => p.capabilities.includes(cap)); }
  async selectProvider(cap) {
    for (const p of this.findByCapability(cap)) {
      if (await p.isAvailable()) return p;
    }
    return null;
  }
}

// Cenario 1: OpenRouter disponivel -> deve escolher ele (primeira preferencia)
const reg1 = new FakeRegistry();
reg1.register({ id: 'openrouter-llm', capabilities: ['text-generation'], isAvailable: async () => true });
reg1.register({ id: 'base44-llm', capabilities: ['text-generation'], isAvailable: async () => true });
const chosen1 = await reg1.selectProvider('text-generation');
console.log('Cenario 1 (OpenRouter disponivel):', chosen1.id, chosen1.id === 'openrouter-llm' ? 'OK' : 'FALHOU');

// Cenario 2: OpenRouter indisponivel (ex: secret nao configurada) -> deve cair pro Base44
const reg2 = new FakeRegistry();
reg2.register({ id: 'openrouter-llm', capabilities: ['text-generation'], isAvailable: async () => false });
reg2.register({ id: 'base44-llm', capabilities: ['text-generation'], isAvailable: async () => true });
const chosen2 = await reg2.selectProvider('text-generation');
console.log('Cenario 2 (OpenRouter indisponivel, fallback):', chosen2.id, chosen2.id === 'base44-llm' ? 'OK' : 'FALHOU');

// Cenario 3: nenhum disponivel -> deve retornar null, nunca travar
const reg3 = new FakeRegistry();
reg3.register({ id: 'openrouter-llm', capabilities: ['text-generation'], isAvailable: async () => false });
const chosen3 = await reg3.selectProvider('text-generation');
console.log('Cenario 3 (nenhum disponivel):', chosen3, chosen3 === null ? 'OK' : 'FALHOU');

// Cenario 4: capacidade que nenhum provider declara -> lista vazia, nao erro
const chosen4 = await reg1.selectProvider('vision');
console.log('Cenario 4 (capacidade sem provider):', chosen4, chosen4 === null ? 'OK' : 'FALHOU');
