# SDK Template
## MemoryOS SDK — Template Oficial

---

## Estrutura Mínima de um SDK

```typescript
// sdk-name/index.ts

export interface ISdkConfig {
  version:    string;
  sdkId:      string;
  domain:     string;
}

export class MySdk {
  readonly sdkId:   string;
  readonly version: string;
  readonly domain:  string;

  constructor(config: ISdkConfig) {
    this.sdkId   = config.sdkId;
    this.version = config.version;
    this.domain  = config.domain;
  }

  async initialize(): Promise<void> {
    // Inicialização do SDK
  }

  getMetadata() {
    return {
      sdkId:   this.sdkId,
      version: this.version,
      domain:  this.domain,
    };
  }
}
```

---

## Manifest Obrigatório

```json
{
  "sdkId":       "my-sdk",
  "version":     "1.0.0",
  "domain":      "domain-name",
  "author":      "Author Name",
  "description": "SDK description",
  "rfc":         "RFC-NNN",
  "mqccs":       { "minScore": 85 },
  "dependencies": []
}
```

---

## Checklist de Publicação

- [ ] Interfaces definidas (nunca classes concretas na API pública)
- [ ] Testes no MRI (mínimo 5 casos)
- [ ] Score MQCCS ≥ 85%
- [ ] README com exemplos de uso
- [ ] CHANGELOG atualizado
- [ ] RFC aprovada

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*