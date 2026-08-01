/**
 * DeveloperPortalPlayground.ts — P8 Developer Portal
 * Playground de execucao de capabilities para desenvolvedores.
 * MDS v2.0 · P8 · Version: 1.0.0
 */

import type { PlaygroundSession, PlaygroundTarget } from "./DeveloperPortalTypes";

const GLOBAL_KEY = "__MEMORY_OS_PLAYGROUND__";

class PlaygroundEngine {
  private readonly sessions = new Map<string, PlaygroundSession>();

  async run(capabilityId: string, target: PlaygroundTarget, input: string): Promise<PlaygroundSession> {
    const id = `pg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const createdAt = new Date().toISOString();

    const pending: PlaygroundSession = Object.freeze({
      id, target, capabilityId, input,
      output: null, durationMs: null,
      createdAt, status: "running",
    });
    this.sessions.set(id, pending);

    const t0 = Date.now();
    try {
      const output = await this.dispatch(target, capabilityId, input);
      const done: PlaygroundSession = Object.freeze({
        ...pending,
        output,
        durationMs: Date.now() - t0,
        status: "success",
      });
      this.sessions.set(id, done);
      return done;
    } catch (err: any) {
      const failed: PlaygroundSession = Object.freeze({
        ...pending,
        output: null,
        durationMs: Date.now() - t0,
        status: "error",
        error: err?.message ?? String(err),
      });
      this.sessions.set(id, failed);
      return failed;
    }
  }

  private async dispatch(target: PlaygroundTarget, capabilityId: string, input: string): Promise<string> {
    if (target === "specialist") {
      return this.runSpecialist(capabilityId, input);
    }
    if (target === "knowledge_package") {
      return this.runKnowledgePackage(capabilityId, input);
    }
    throw new Error(`Target '${target}' nao suportado no Playground`);
  }

  private async runSpecialist(capabilityId: string, input: string): Promise<string> {
    const domainMap: Record<string, string> = {
      "com.memoryos.financial-specialist": "financial",
      "com.memoryos.legal-specialist": "legal",
      "com.memoryos.medical-specialist": "medical",
      "com.memoryos.tech-specialist": "tech",
    };
    const domain = domainMap[capabilityId];
    if (!domain) throw new Error(`Specialist '${capabilityId}' nao encontrado`);

    const { FinancialSpecialist } = await import("@/lib/specialists/FinancialSpecialist");
    const { LegalSpecialist } = await import("@/lib/specialists/LegalSpecialist");
    const { MedicalSpecialist } = await import("@/lib/specialists/MedicalSpecialist");
    const { TechSpecialist } = await import("@/lib/specialists/TechSpecialist");

    const specialists: Record<string, any> = {
      "com.memoryos.financial-specialist": new FinancialSpecialist(),
      "com.memoryos.legal-specialist": new LegalSpecialist(),
      "com.memoryos.medical-specialist": new MedicalSpecialist(),
      "com.memoryos.tech-specialist": new TechSpecialist(),
    };

    const specialist = specialists[capabilityId];
    if (!specialist.canHandle(input)) {
      return JSON.stringify({ warning: "Este specialist pode nao ser o ideal para esta consulta, mas processando mesmo assim..." });
    }

    const result = await specialist.execute({ query: input, context: {} });
    return JSON.stringify(result, null, 2);
  }

  private async runKnowledgePackage(capabilityId: string, input: string): Promise<string> {
    const { FinancialPackage } = await import("@/lib/knowledge-packages/FinancialPackage");
    const { LegalPackage } = await import("@/lib/knowledge-packages/LegalPackage");
    const { BrazilianGovernmentPackage } = await import("@/lib/knowledge-packages/BrazilianGovernmentPackage");

    const pkgMap: Record<string, any> = {
      "com.memoryos.financial": new FinancialPackage(),
      "com.memoryos.legal": new LegalPackage(),
      "com.memoryos.brazilian-government": new BrazilianGovernmentPackage(),
    };

    const pkg = pkgMap[capabilityId];
    if (!pkg) throw new Error(`Knowledge Package '${capabilityId}' nao encontrado`);

    const results = pkg.search(input);
    return JSON.stringify({ query: input, results: results.slice(0, 5) }, null, 2);
  }

  listSessions(): readonly PlaygroundSession[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getSession(id: string): PlaygroundSession | undefined {
    return this.sessions.get(id);
  }
}

function getPlayground(): PlaygroundEngine {
  if (!(globalThis as any)[GLOBAL_KEY]) {
    (globalThis as any)[GLOBAL_KEY] = new PlaygroundEngine();
  }
  return (globalThis as any)[GLOBAL_KEY];
}

export const DeveloperPlayground = getPlayground();