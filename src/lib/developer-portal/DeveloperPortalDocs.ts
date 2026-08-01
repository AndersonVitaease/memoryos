/**
 * DeveloperPortalDocs.ts — P8 Developer Portal
 * Documentacao interativa oficial do MemoryOS para desenvolvedores.
 * MDS v2.0 · P8 · Version: 1.0.0
 */

import type { DocEntry } from "./DeveloperPortalTypes";

export const OFFICIAL_DOCS: readonly DocEntry[] = Object.freeze([
  {
    id: "getting-started-overview",
    title: "Visao Geral do MemoryOS",
    category: "getting-started",
    description: "Introducao ao MemoryOS e seus conceitos fundamentais.",
    tags: ["intro", "overview", "architecture"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# MemoryOS — Visao Geral

O MemoryOS e um Sistema Operacional Cognitivo. A inteligencia nao esta concentrada no prompt — ela esta distribuida na arquitetura.

## Conceitos Fundamentais

### Knowledge Object
Toda entidade do sistema e representada por um Knowledge Object com identidade permanente.

### Observations
Os motores nao modificam objetos diretamente. Eles produzem Observations:
- **Evidence**: conhecimento observado diretamente (OCR, API, Banco)
- **Inference**: conhecimento inferido ("Este contrato apresenta alto risco")
- **Hypothesis**: conhecimento ainda nao confirmado

### Knowledge Registry
Fonte unica da verdade. Armazena Knowledge Objects, Observations, relacionamentos e proveniencia.

### Operational State
Projecao otimizada do estado atual, mantida em background via CQRS.`,
  },
  {
    id: "sdk-core-overview",
    title: "Core SDK",
    category: "sdk",
    description: "WorkingMemory, EventBus, AuditTrail e CoreContext.",
    tags: ["sdk", "core", "working-memory", "event-bus"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# Core SDK

## Instalacao
\`\`\`ts
import { WorkingMemory, EventBus, AuditTrail, CoreContext } from "@/sdk/core";
\`\`\`

## WorkingMemory
Gerencia o estado de curto prazo da sessao atual.

\`\`\`ts
const wm = WorkingMemory.getInstance();
wm.set("currentProject", { id: "proj-1", name: "Alpha" });
const project = wm.get("currentProject");
\`\`\`

## EventBus
Comunicacao assincrona entre modulos sem acoplamento direto.

\`\`\`ts
EventBus.emit("observation.created", { id: "obs-1", nature: "Evidence" });
EventBus.on("observation.created", (obs) => console.log(obs));
\`\`\`

## AuditTrail
Rastreabilidade imutavel de todas as acoes do sistema.

\`\`\`ts
AuditTrail.record({ action: "publish", capabilityId: "com.memoryos.financial" });
\`\`\``,
  },
  {
    id: "specialists-guide",
    title: "Criando um Specialist",
    category: "specialists",
    description: "Guia completo para criar e publicar um novo Specialist.",
    tags: ["specialist", "sdk", "domain", "p5"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# Criando um Specialist

## Estrutura Obrigatoria (MDS v2.0)
\`\`\`
src/lib/specialists/
  MeuSpecialist.ts      — implementacao
  SpecialistTypes.ts    — tipos imutaveis
  specialistTests.ts    — suite de testes
  index.ts              — exports
\`\`\`

## Implementacao Minima
\`\`\`ts
import { BaseSpecialist } from "@/sdk/specialist/BaseSpecialist";
import { SpecialistBuilder } from "@/sdk/specialist/SpecialistBuilder";

const MANIFEST = new SpecialistBuilder(
  "com.minha-org.meu-specialist",
  "1.0.0",
  "Meu Specialist",
  "meu-dominio"
).setAuthor("Minha Org").build();

export class MeuSpecialist extends BaseSpecialist {
  constructor() { super(MANIFEST); }

  canHandle(query: string): boolean {
    return query.includes("minha-palavra-chave");
  }

  protected async onExecute(request) {
    // Invocar LLM, retornar { facts, reasoning, recommendations, confidence }
  }
}
\`\`\`

## Publicacao no Marketplace
\`\`\`ts
import { CapabilityRegistry } from "@/lib/marketplace";

CapabilityRegistry.publish({
  manifest: { id: "com.minha-org.meu-specialist", kind: "specialist", ... },
  compatibilityConstraints: { requiresIds: [], conflictsWith: [], minPlatformVersion: "1.0.0" },
});
\`\`\``,
  },
  {
    id: "knowledge-packages-guide",
    title: "Criando um Knowledge Package",
    category: "knowledge-packages",
    description: "Guia completo para estruturar e publicar um Knowledge Package.",
    tags: ["knowledge-package", "sdk", "graph", "p6"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# Criando um Knowledge Package

## Estrutura Obrigatoria (MDS v2.0)
\`\`\`
src/lib/knowledge-packages/
  MeuPackage.ts             — implementacao
  KnowledgePackageTypes.ts  — tipos imutaveis
  knowledgePackageTests.ts  — suite de testes
  index.ts                  — exports
\`\`\`

## Implementacao Minima
\`\`\`ts
import { BaseKnowledgePackage } from "@/sdk/knowledge/BaseKnowledgePackage";
import { KnowledgePackageBuilder } from "@/sdk/knowledge/KnowledgePackageBuilder";

const MANIFEST = new KnowledgePackageBuilder(
  "com.minha-org.meu-package",
  "1.0.0",
  "Meu Package",
  "meu-dominio"
).setAuthor("Minha Org").build();

export class MeuPackage extends BaseKnowledgePackage {
  constructor() { super(MANIFEST); }

  content() {
    return {
      nodes: [
        { id: "node-1", label: "Conceito A", type: "concept", data: {}, confidence: 0.9 }
      ],
      edges: [
        { from: "node-1", to: "node-2", relation: "relates_to", weight: 0.8 }
      ],
    };
  }
}
\`\`\``,
  },
  {
    id: "marketplace-publish",
    title: "Publicando no Marketplace",
    category: "marketplace",
    description: "Como registrar capabilities no CapabilityRegistry.",
    tags: ["marketplace", "registry", "publish", "p7"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# Publicando no Marketplace

## Fluxo
\`\`\`
PublishRequest → CapabilityRegistry.publish() → Validacao → RegistryEntry (frozen)
\`\`\`

## Exemplo Completo
\`\`\`ts
import { CapabilityRegistry } from "@/lib/marketplace";

const result = CapabilityRegistry.publish({
  manifest: {
    id: "com.minha-org.meu-specialist",
    name: "Meu Specialist",
    version: "1.0.0",
    kind: "specialist",
    domain: "meu-dominio",
    author: "Minha Org",
    description: "Descricao do specialist",
    tier: "community",
    status: "beta",
    languages: ["pt-BR"],
    tags: ["minha-tag"],
  },
  compatibilityConstraints: {
    requiresIds: [],
    conflictsWith: [],
    minPlatformVersion: "1.0.0",
  },
});

if (result.success) {
  console.log("Publicado:", result.capabilityId);
}
\`\`\`

## Consultas
\`\`\`ts
// Buscar por tipo
const specialists = CapabilityRegistry.query({ kind: "specialist" });

// Buscar por dominio
const financial = CapabilityRegistry.query({ domain: "financial" });

// Verificar compatibilidade
const { compatible } = CapabilityRegistry.checkCompatibility("id-a", "id-b");
\`\`\``,
  },
  {
    id: "architecture-cqrs",
    title: "Arquitetura CQRS e Knowledge Objects",
    category: "architecture",
    description: "Como o MemoryOS separa Write Model (Observations) e Read Model (Operational State).",
    tags: ["architecture", "cqrs", "knowledge-object", "observations"],
    version: "1.0.0",
    updatedAt: "2026-08-01",
    content: `# Arquitetura CQRS

## Separacao de Responsabilidades

### Write Model — Observations (Append Only)
- Historico imutavel de todo conhecimento produzido
- Cada Observation carrega: origin, motor, data, evidence, confidence, dependencies

### Read Model — Operational State
- Projecao otimizada mantida em background
- Reconstruida automaticamente a partir das Observations
- Usada exclusivamente pelo Planner

## Fluxo
\`\`\`
Conectores
    ↓
Observation Engine
    ↓
Knowledge Registry
    ├── Knowledge Index    (busca semantica, entidades, timeline)
    └── Operational State  (projecao otimizada)
         ↓
    Context Builder
         ↓
    Entity Resolution
         ↓
       Planner
         ↓
        IA
\`\`\`

## Regra Fundamental
A IA recebe apenas **conhecimento relevante**, nunca o historico bruto da conversa.`,
  },
]);