// ─── Specialist Catalog ────────────────────────────────────────────────────────
// Foundation v1.0 · Built-in Specialists registered via Capability Registry

import type { SpecialistContract, SpecialistCapability } from "./SpecialistTypes";
import { makeManifest } from "@/lib/capabilities/registry/CapabilityContract";
import { globalCapabilityRegistry } from "@/lib/capabilities/registry/CapabilityRegistry";

// ── Catalog definition ────────────────────────────────────────────────────────

const CATALOG: SpecialistContract[] = [
  {
    id: "specialist_juridico", name: "Specialist Jurídico", version: "1.0.0",
    domain: "juridico", description: "Especialista em direito empresarial, contratos, constituição de sociedades e registro de marcas.",
    capabilities: ["mri", "document_analysis"],
    supportedGoals: ["abrir empresa", "constituir empresa", "contrato", "marca", "inpi", "jurídico", "societário", "ltda", "mei", "s/a"],
    supportedKnowledge: ["direito_empresarial", "contratos", "propriedade_intelectual"],
    supportedConnectors: [], confidenceLevel: 0.90, available: true,
    permissions: ["read:documents", "create:legal_analysis"],
    tags: ["juridico", "empresarial", "contratos", "marcas", "societario"],
    metadata: { experienceYears: 10, successRate: 0.92 },
  },
  {
    id: "specialist_contabil", name: "Specialist Contábil", version: "1.0.0",
    domain: "contabil", description: "Especialista em contabilidade empresarial, escrituração, balanços e abertura de empresas.",
    capabilities: ["mri"],
    supportedGoals: ["abrir empresa", "contabilidade", "balancete", "balanço", "escrituração", "mei", "nota fiscal", "simples nacional"],
    supportedKnowledge: ["contabilidade", "fiscal", "tributario"],
    supportedConnectors: [], confidenceLevel: 0.88, available: true,
    permissions: ["read:financial", "create:accounting"],
    tags: ["contabil", "fiscal", "financeiro", "escrituracao"],
    metadata: { experienceYears: 8, successRate: 0.90 },
  },
  {
    id: "specialist_tributario", name: "Specialist Tributário", version: "1.0.0",
    domain: "tributario", description: "Especialista em planejamento tributário, regimes fiscais, IRPF, IRPJ e obrigações acessórias.",
    capabilities: ["mri"],
    supportedGoals: ["irpf", "irpj", "simples nacional", "lucro real", "lucro presumido", "tributário", "imposto", "pgdas", "das"],
    supportedKnowledge: ["direito_tributario", "planejamento_fiscal", "obrigacoes_acessorias"],
    supportedConnectors: [], confidenceLevel: 0.92, available: true,
    permissions: ["read:financial"],
    tags: ["tributario", "fiscal", "imposto", "irpf", "irpj", "simples"],
    metadata: { experienceYears: 12, successRate: 0.91 },
  },
  {
    id: "specialist_anvisa", name: "Specialist ANVISA", version: "1.0.0",
    domain: "anvisa", description: "Especialista em regulação sanitária, registro de produtos, licenças ANVISA e boas práticas de fabricação.",
    capabilities: ["mri"],
    supportedGoals: ["anvisa", "suplemento", "alimento", "medicamento", "cosmetico", "registro sanitário", "vigilância sanitária", "bpf"],
    supportedKnowledge: ["regulacao_sanitaria", "boas_praticas", "registro_anvisa"],
    supportedConnectors: [], confidenceLevel: 0.94, available: true,
    permissions: ["read:regulatory"],
    tags: ["anvisa", "sanitario", "suplemento", "medicamento", "regulatorio"],
    metadata: { experienceYears: 9, successRate: 0.93 },
  },
  {
    id: "specialist_comercio_exterior", name: "Specialist Comércio Exterior", version: "1.0.0",
    domain: "comercio_exterior", description: "Especialista em importação, exportação, SISCOMEX, NCM, despacho aduaneiro e comércio internacional.",
    capabilities: ["mri"],
    supportedGoals: ["importar", "importação", "exportar", "exportação", "siscomex", "despacho", "aduaneiro", "ncm", "li", "di"],
    supportedKnowledge: ["comercio_exterior", "aduaneiro", "logistica_internacional"],
    supportedConnectors: [], confidenceLevel: 0.91, available: true,
    permissions: ["read:trade"],
    tags: ["importacao", "exportacao", "aduaneiro", "siscomex", "comex"],
    metadata: { experienceYears: 11, successRate: 0.89 },
  },
  {
    id: "specialist_financeiro", name: "Specialist Financeiro", version: "1.0.0",
    domain: "financeiro", description: "Especialista em análise financeira, fluxo de caixa, DRE, planejamento orçamentário e captação de recursos.",
    capabilities: ["mri"],
    supportedGoals: ["financeiro", "fluxo de caixa", "dre", "orçamento", "captação", "investimento", "capital de giro"],
    supportedKnowledge: ["financas", "analise_financeira", "orcamento"],
    supportedConnectors: [], confidenceLevel: 0.87, available: true,
    permissions: ["read:financial"],
    tags: ["financeiro", "fluxo_caixa", "dre", "orcamento", "investimento"],
    metadata: { experienceYears: 9, successRate: 0.88 },
  },
  {
    id: "specialist_rh", name: "Specialist RH", version: "1.0.0",
    domain: "rh", description: "Especialista em recursos humanos, CLT, folha de pagamento, admissão, demissão e eSocial.",
    capabilities: ["mri"],
    supportedGoals: ["rh", "clt", "folha de pagamento", "admissão", "demissão", "esocial", "fgts", "inss"],
    supportedKnowledge: ["direito_trabalhista", "folha_pagamento", "esocial"],
    supportedConnectors: [], confidenceLevel: 0.86, available: true,
    permissions: ["read:hr"],
    tags: ["rh", "clt", "folha", "esocial", "trabalhista"],
    metadata: { experienceYears: 7, successRate: 0.87 },
  },
  {
    id: "specialist_compliance", name: "Specialist Compliance", version: "1.0.0",
    domain: "compliance", description: "Especialista em conformidade regulatória, LGPD, auditoria interna, gestão de riscos e governança corporativa.",
    capabilities: ["mri"],
    supportedGoals: ["lgpd", "compliance", "auditoria", "risco", "governança", "conformidade", "privacidade"],
    supportedKnowledge: ["lgpd", "compliance", "auditoria", "governanca"],
    supportedConnectors: [], confidenceLevel: 0.89, available: true,
    permissions: ["read:compliance"],
    tags: ["compliance", "lgpd", "governanca", "auditoria", "risco"],
    metadata: { experienceYears: 8, successRate: 0.90 },
  },
  {
    id: "specialist_geral", name: "Specialist Geral", version: "1.0.0",
    domain: "geral", description: "Specialist generalista para Goals sem domínio específico identificado. Cobre necessidades amplas com baixo custo.",
    capabilities: ["mri"],
    supportedGoals: [], // fallback — matches anything
    supportedKnowledge: ["geral"],
    supportedConnectors: [], confidenceLevel: 0.60, available: true,
    permissions: [],
    tags: ["geral", "generalista", "fallback"],
    metadata: { experienceYears: 5, successRate: 0.70 },
  },
];

// ── Bootstrap: register all specialists in Capability Registry ─────────────────

let _bootstrapped = false;

export function bootstrapSpecialists(): void {
  if (_bootstrapped) return;
  _bootstrapped = true;

  for (const s of CATALOG) {
    const id = s.id;
    if (globalCapabilityRegistry.has(id)) continue;

    const cap: SpecialistCapability = {
      manifest: makeManifest({
        id,
        name:        s.name,
        version:     s.version,
        type:        "Specialist",
        category:    "Custom",
        description: s.description,
        author:      "MemoryOS Foundation v1.0",
        status:      s.available ? "active" : "inactive",
        tags:        s.tags,
        minimumFoundationVersion: "1.0",
        metadata:    { specialist: s },
      }) as any,
    };

    globalCapabilityRegistry.register(cap);
  }
}

export function getSpecialistCatalog(): SpecialistContract[] { return CATALOG; }