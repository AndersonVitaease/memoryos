/**
 * CodeQualityAuditor.ts — Sprint EF-55.1 Architectural Certification
 *
 * FASE 3+4: SOLID analysis + code quality findings.
 * Evidências baseadas em leitura direta dos arquivos auditados.
 */

import type { SolidAnalysis, CodeQualityFinding } from "./OfficialCertificationReport";

export class CodeQualityAuditor {
  auditSolid(): { analysis: SolidAnalysis[]; score: number } {
    const analysis: SolidAnalysis[] = [
      // SRP
      { principle: "SRP", module: "RuntimeTraceCollector", compliant: true, evidence: "Única responsabilidade: executar pipeline e capturar snapshots reais.", issues: "Nenhuma" },
      { principle: "SRP", module: "RuntimeEvidenceCollector", compliant: true, evidence: "Única responsabilidade: converter PipelineSnapshot em ExecutionEvidence.", issues: "Nenhuma" },
      { principle: "SRP", module: "ScenarioValidator", compliant: true, evidence: "Única responsabilidade: calcular as 4 dimensões de confiança.", issues: "Instancia ScenarioEvidence internamente (module-level const) — aceitável" },
      { principle: "SRP", module: "GoldenScenarioRunner", compliant: true, evidence: "Única responsabilidade: iterar cenários e coletar evidências.", issues: "Nenhuma" },
      { principle: "SRP", module: "SystemCertificationEngine", compliant: true, evidence: "Orquestra auditors — não implementa lógica de auditoria.", issues: "Singleton de classe vazia antes do primeiro certify() — não é problema de SRP" },

      // OCP
      { principle: "OCP", module: "ScenarioRegistry", compliant: true, evidence: "GOLDEN_SCENARIOS é readonly array — novos cenários são adicionados sem modificar existentes.", issues: "Nenhuma" },
      { principle: "OCP", module: "SystemCertificationEngine", compliant: true, evidence: "Novos auditors podem ser adicionados ao array auditResults sem modificar certify().", issues: "Adição requer modificação do array auditResults — OCP parcial" },

      // LSP
      { principle: "LSP", module: "AuditResult", compliant: true, evidence: "Todos os AuditResult produzidos pelos auditors são estruturalmente idênticos — nenhuma subclasse quebra o contrato.", issues: "Nenhuma" },

      // ISP
      { principle: "ISP", module: "TraceInput", compliant: true, evidence: "Interface TraceInput tem apenas campos necessários ao RuntimeTraceCollector.", issues: "intent? e context? são opcionais — sem imposição de campos não usados" },
      { principle: "ISP", module: "GoldenScenario", compliant: true, evidence: "Campos da interface correspondem exatamente ao que ScenarioValidator consome.", issues: "Nenhuma" },

      // DIP
      { principle: "DIP", module: "ScenarioValidator", compliant: true, evidence: "Depende de interfaces (GoldenScenario, ExecutionEvidence) — não de implementações.", issues: "Nenhuma" },
      { principle: "DIP", module: "SystemCertificationEngine", compliant: false, evidence: "Instancia diretamente IntegrationAuditor, PipelineAuditor, etc. sem injeção de dependência.", issues: "Acoplamento a implementações concretas — DIP violado; aceitável para singletons de infraestrutura" },
    ];

    const compliant = analysis.filter(a => a.compliant).length;
    const score     = Math.round(compliant / analysis.length * 100);
    return { analysis, score };
  }

  auditQuality(): { findings: CodeQualityFinding[]; score: number } {
    const findings: CodeQualityFinding[] = [

      // Acoplamento: ConnectorSnapshot usa makeSCId() para connectorId
      { category: "coupling", severity: "medium", module: "RuntimeTraceCollector",
        finding: "ConnectorSnapshot.connectorId gerado com makeSCId() — não é o ID real do conector. Cria ilusão de rastreabilidade sem ligação ao conector real." },

      // plannerId e strategyId em RuntimeEvidenceCollector são sintéticos
      { category: "coupling", severity: "medium", module: "RuntimeEvidenceCollector",
        finding: "plannerId e strategyId são gerados com makeSCId() — EF-43/45/46 não integrados. IDs não rastreiam engines reais." },

      // ScenarioEvidence: lógica de `isPresent` com OR errado
      { category: "complexity", severity: "low", module: "ScenarioEvidence",
        finding: "Condição isPresent tem operador de precedência ambígua: `val !== 0 || (typeof val === 'number' && !isNaN(val))`. Para val=0, a primeira cláusula é false mas a segunda é true — resultado correto, mas código confuso." },

      // SystemCertificationEngine: instancia 11 classes no construtor
      { category: "coupling", severity: "low", module: "SystemCertificationEngine",
        finding: "11 instâncias criadas no construtor da classe interna — forte acoplamento estrutural. Aceitável para um engine singleton de infraestrutura." },

      // GoldenScenarioRunner: loop sequencial para 8 cenários
      { category: "complexity", severity: "low", module: "GoldenScenarioRunner",
        finding: "Cenários executados sequencialmente em for-loop. Para 8 cenários isso é aceitável, mas crescimento futuro pode impactar performance." },

      // Código morto: ScenarioValidator usa `status` com lógica incorreta
      { category: "complexity", severity: "medium", module: "ScenarioValidator",
        finding: "status = issues.filter(i => !i.includes('warning')).length === 0 ? 'pass' : score >= 70 ? 'warn' : 'fail'. A condição !i.includes('warning') filtra issues que contêm a string 'warning' — mas nenhuma issue contém essa string. Condição é sempre verdadeira: status = issues.length === 0 ? 'pass' : score >= 70 ? 'warn' : 'fail'." },

      // Nomeação: deterministmScore (typo)
      { category: "naming", severity: "low", module: "SCTypes/CertificationMetrics",
        finding: "deterministmScore (typo: falta 'i' — deveria ser deterministicScore). Propagado em SCTypes.ts, CertificationMetrics.ts e SprintEF555Page.jsx." },

      // knowledge_store: artifactId sintético
      { category: "coupling", severity: "medium", module: "RuntimeTraceCollector",
        finding: "PipelineStepSnapshot para 'knowledge_store' usa makeSCId('ks') como artifactId. KnowledgeStore não produz IDs — limitação da engine, não erro de implementação." },
    ];

    const highSeverity = findings.filter(f => f.severity === "high").length;
    const medSeverity  = findings.filter(f => f.severity === "medium").length;
    const score = Math.max(0, 100 - highSeverity * 25 - medSeverity * 10 - findings.filter(f => f.severity === "low").length * 3);
    return { findings, score };
  }
}