# Knowledge Package Template
## MemoryOS Knowledge Package — Template Oficial

---

## O que é um Knowledge Package

Um Knowledge Package é uma coleção estruturada de conhecimento de domínio que pode ser carregada pelo MemoryOS para enriquecer respostas de Specialists.

---

## Estrutura Obrigatória

```typescript
export interface KnowledgeNode {
  nodeId:      string;
  type:        "concept" | "fact" | "rule" | "procedure" | "example";
  domain:      string;
  title:       string;
  content:     string;
  tags:        string[];
  relations:   { nodeId: string; relation: string }[];
  confidence:  number; // 0-1
  source:      string;
  version:     string;
}

export interface KnowledgePackage {
  packageId:   string;
  domain:      string;
  version:     string;
  language:    string;
  nodes:       KnowledgeNode[];
  metadata: {
    author:      string;
    rfc:         string;
    createdAt:   string;
    description: string;
  };
}

// Exemplo de uso
export const myPackage: KnowledgePackage = {
  packageId: "my-domain-v1",
  domain:    "my-domain",
  version:   "1.0.0",
  language:  "pt-BR",
  nodes: [
    {
      nodeId:     "node-001",
      type:       "concept",
      domain:     "my-domain",
      title:      "Conceito Principal",
      content:    "Descrição do conceito...",
      tags:       ["tag1", "tag2"],
      relations:  [],
      confidence: 0.95,
      source:     "official-docs",
      version:    "1.0",
    },
  ],
  metadata: {
    author:      "Author Name",
    rfc:         "RFC-NNN",
    createdAt:   "2026-07-10",
    description: "Descrição do pacote",
  },
};
```

---

## Checklist de Publicação

- [ ] Mínimo 10 nodes por domínio
- [ ] Confidence ≥ 0.8 para todos os nodes
- [ ] Relations mapeadas entre nodes relacionados
- [ ] Testado com Specialist do domínio
- [ ] RFC aprovada

---

*MemoryOS Foundation v1.0.0 — 2026-07-10*