/**
 * CapabilityBootstrap.ts — P7 Marketplace Registry
 * Registra automaticamente todos os Specialists (P5) e Knowledge Packages (P6)
 * no CapabilityRegistry no boot da plataforma.
 * MDS v2.0 · P7 · Version: 1.0.0
 */

import { CapabilityRegistry } from "./CapabilityRegistry";
import type { PublishRequest } from "./MarketplaceTypes";

// ---------------------------------------------------------------------------
// Specialists oficiais (P5)
// ---------------------------------------------------------------------------
const OFFICIAL_SPECIALISTS: PublishRequest[] = [
  {
    manifest: {
      id: "com.memoryos.financial-specialist",
      name: "Financial Specialist",
      version: "1.0.0",
      kind: "specialist",
      domain: "financial",
      author: "MemoryOS",
      description: "Tributacao, investimentos, contabilidade e fluxo de caixa brasileiros.",
      tier: "official",
      status: "active",
      languages: ["pt-BR", "en-US"],
      tags: ["financial", "tax", "investment", "accounting"],
    },
    compatibilityConstraints: {
      requiresIds: ["com.memoryos.financial"],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
  {
    manifest: {
      id: "com.memoryos.legal-specialist",
      name: "Legal Specialist",
      version: "1.0.0",
      kind: "specialist",
      domain: "legal",
      author: "MemoryOS",
      description: "Direito civil, trabalhista e do consumidor brasileiro.",
      tier: "official",
      status: "active",
      languages: ["pt-BR", "en-US"],
      tags: ["legal", "law", "labor", "consumer", "contracts"],
    },
    compatibilityConstraints: {
      requiresIds: ["com.memoryos.legal"],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
  {
    manifest: {
      id: "com.memoryos.medical-specialist",
      name: "Medical Specialist",
      version: "1.0.0",
      kind: "specialist",
      domain: "medical",
      author: "MemoryOS",
      description: "Informacoes educacionais de saude com rigorosas salvaguardas de seguranca.",
      tier: "official",
      status: "active",
      languages: ["pt-BR", "en-US"],
      tags: ["medical", "health", "medication", "symptoms"],
    },
    compatibilityConstraints: {
      requiresIds: [],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
  {
    manifest: {
      id: "com.memoryos.tech-specialist",
      name: "Tech Specialist",
      version: "1.0.0",
      kind: "specialist",
      domain: "tech",
      author: "MemoryOS",
      description: "Arquitetura de software, desenvolvimento web e DevOps.",
      tier: "official",
      status: "active",
      languages: ["pt-BR", "en-US"],
      tags: ["tech", "software", "architecture", "devops", "code"],
    },
    compatibilityConstraints: {
      requiresIds: [],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
];

// ---------------------------------------------------------------------------
// Knowledge Packages oficiais (P6)
// ---------------------------------------------------------------------------
const OFFICIAL_KNOWLEDGE_PACKAGES: PublishRequest[] = [
  {
    manifest: {
      id: "com.memoryos.financial",
      name: "Financial Knowledge Package",
      version: "1.0.0",
      kind: "knowledge_package",
      domain: "financial",
      author: "MemoryOS",
      description: "Conceitos financeiros, tributacao e padroes de investimento brasileiros.",
      tier: "official",
      status: "active",
      languages: ["pt-BR"],
      tags: ["financial", "tax", "investment", "CDI", "Selic"],
    },
    compatibilityConstraints: {
      requiresIds: [],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
  {
    manifest: {
      id: "com.memoryos.legal",
      name: "Legal Knowledge Package",
      version: "1.0.0",
      kind: "knowledge_package",
      domain: "legal",
      author: "MemoryOS",
      description: "Direito trabalhista, consumidor e civil brasileiro.",
      tier: "official",
      status: "active",
      languages: ["pt-BR"],
      tags: ["legal", "CLT", "CDC", "civil"],
    },
    compatibilityConstraints: {
      requiresIds: [],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
  {
    manifest: {
      id: "com.memoryos.brazilian-government",
      name: "Brazilian Government Knowledge Package",
      version: "1.0.0",
      kind: "knowledge_package",
      domain: "government",
      author: "MemoryOS",
      description: "Servicos federais, regulacoes e procedimentos tributarios brasileiros.",
      tier: "official",
      status: "active",
      languages: ["pt-BR"],
      tags: ["government", "CPF", "MEI", "INSS", "IRPF"],
    },
    compatibilityConstraints: {
      requiresIds: [],
      conflictsWith: [],
      minPlatformVersion: "1.0.0",
    },
  },
];

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
export interface BootstrapResult {
  readonly registeredCount: number;
  readonly errors: readonly string[];
  readonly durationMs: number;
}

export function bootstrapOfficialCapabilities(): BootstrapResult {
  const t0 = Date.now();
  const errors: string[] = [];
  let registeredCount = 0;

  const all = [...OFFICIAL_KNOWLEDGE_PACKAGES, ...OFFICIAL_SPECIALISTS];

  for (const req of all) {
    try {
      const result = CapabilityRegistry.publish(req);
      if (result.success) {
        registeredCount++;
      } else {
        errors.push(`[${req.manifest.id}] ${result.errors.join(", ")}`);
      }
    } catch (err: any) {
      errors.push(`[${req.manifest.id}] ${err?.message ?? "unknown error"}`);
    }
  }

  return Object.freeze({ registeredCount, errors, durationMs: Date.now() - t0 });
}