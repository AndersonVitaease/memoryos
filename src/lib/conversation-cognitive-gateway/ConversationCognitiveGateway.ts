/**
 * ConversationCognitiveGateway.ts — Phase 5.5
 * 2026-07-13
 *
 * THE only entry point from the conversational layer into the MemoryOS cognitive architecture.
 *
 * Architecture rules:
 *   - Conversation → Gateway → LiveCognitivePipeline (never direct connector access)
 *   - Gateway classifies intent → routes to pipeline when required
 *   - Pipeline completion is awaited before response generation
 *   - Every answer is evidence-based with executionId + confidence
 *   - Graceful degradation: GitHub down → Base44 only; both down → memory only
 */

import { LiveCognitivePipeline } from "../live-cognitive-pipeline/LiveCognitivePipeline";
import { CognitiveAnswerComposer } from "../cognitive-answer-composer/CognitiveAnswerComposer";
import { GitHubQueryRouter } from "./GitHubQueryRouter";
import { ConnectorInvocationService } from "../cognitive-connector/ConnectorInvocationService";
import { RepositoryResolver } from "../github-deep-analysis/RepositoryResolver";
import { SearchRanker } from "../github-deep-analysis/SearchRanker";
import type {
  GatewayRequest, CognitiveAnswer, IntentClassification, CognitiveIntent,
  GatewayDiagnostic, CCGReport, AnswerSource,
} from "./CCGTypes";
import { makeCCGId } from "./CCGTypes";

// ── Intent keyword map ────────────────────────────────────────────────────────

const INTENT_PATTERNS: Array<{ intent: CognitiveIntent; keywords: string[]; requiresCognitive: boolean }> = [
  { intent: "project_status",          keywords: ["status", "where did we stop", "onde paramos", "estado do projeto", "current state", "estado atual", "project state", "o que fizemos"], requiresCognitive: true },
  { intent: "next_sprint",             keywords: ["next sprint", "próximo sprint", "próxima sprint", "what next", "o que vem depois", "recommend", "recomend", "next step", "próxima etapa"], requiresCognitive: true },
  { intent: "repository_analysis",     keywords: ["reposit", "github", "branch", "commit", "code", "código", "repo", "pull request", "pr "], requiresCognitive: true },
  { intent: "application_analysis",    keywords: ["application", "entities", "sessions", "projects", "base44", "database", "dados", "entidades", "sessions", "sessões"], requiresCognitive: true },
  { intent: "knowledge_reconstruction",keywords: ["knowledge", "conhecimento", "reconstruct", "reconstruir", "what do we know", "o que sabemos", "knowledge graph"], requiresCognitive: true },
  { intent: "architecture_question",   keywords: ["architect", "arquitetura", "pipeline", "engine", "component", "componente", "module", "módulo", "layer", "camada"], requiresCognitive: true },
  { intent: "implementation_status",   keywords: ["implemented", "implementado", "done", "completo", "finished", "concluído", "what was built", "o que foi construído", "certification", "certified"], requiresCognitive: true },
  { intent: "connector_diagnostics",   keywords: ["connector", "conector", "diagnostic", "diagnóstico", "health", "saúde", "operational", "operacional", "ping"], requiresCognitive: true },
  { intent: "project_history",         keywords: ["history", "histórico", "timeline", "what happened", "o que aconteceu", "past", "passado", "decisions", "decisões"], requiresCognitive: true },
  { intent: "technical_debt",          keywords: ["debt", "dívida técnica", "tech debt", "refactor", "refatorar", "missing", "faltando", "gap", "issue", "problema pendente"], requiresCognitive: true },
];

// ── Answer Generator ──────────────────────────────────────────────────────────

function generateAnswer(
  request: GatewayRequest,
  intent: IntentClassification,
  pipelineReport: any,
): CognitiveAnswer {
  const t0 = Date.now();
  const snapshot    = pipelineReport?.snapshot;
  const appState    = snapshot?.applicationState  as any ?? {};
  const repoState   = snapshot?.repositoryState   as any ?? {};
  const goalState   = snapshot?.goalState         as any ?? {};
  const learnState  = snapshot?.learningState     as any ?? {};
  const recEvents   = pipelineReport?.recoveryEvents ?? [];
  const stages      = pipelineReport?.stages ?? [];
  const pStatus     = pipelineReport?.status ?? "UNKNOWN";

  const connectors: string[] = [];
  const cisStage = stages.find((s: any) => s.stageName === "ConnectorInvocationService");
  if (cisStage?.output?.base44Status === "SUCCESS") connectors.push("base44");
  if (cisStage?.output?.githubStatus === "SUCCESS") connectors.push("github");

  const executed = stages.filter((s: any) => s.status === "SUCCESS").map((s: any) => s.stageName);
  const evidence  = snapshot?.evidence ?? [];
  const conf      = snapshot?.confidence ?? 0.5;
  const degraded  = pStatus !== "OPERATIONAL";
  const degradationReason = recEvents.length > 0
    ? recEvents.map((r: any) => `${r.affectedStage}: ${r.cause}`).join("; ")
    : null;
  const recoveryInfo = recEvents.length > 0
    ? recEvents.map((r: any) => r.strategy).join("; ")
    : null;

  // ── Build answer text ─────────────────────────────────────────────────────
  let answer = "";

  if (intent.intent === "project_status") {
    const projCount = appState.projectCount ?? 0;
    const totalRec  = appState.totalRecords  ?? 0;
    const repoCount = repoState.repoCount    ?? 0;
    const subGoals  = goalState.subGoals     ?? 0;
    const topRec    = goalState.topRec;
    answer = `**MemoryOS — Estado Atual do Projeto**\n\n`
      + `**Base44:** ${projCount} projeto(s) · ${totalRec} registros de entidades\n`
      + (repoCount > 0 ? `**GitHub:** ${repoCount} repositório(s) · ${repoState.branchCount ?? 0} branches · ${repoState.commitCount ?? 0} commits recentes\n` : `**GitHub:** não configurado (token ausente)\n`)
      + `**Goal Intelligence:** ${subGoals} sub-objetivos ativos\n`
      + (topRec ? `**Próxima ação recomendada:** ${topRec}\n` : "")
      + (degraded ? `\n⚠️ Pipeline degradado: ${degradationReason}` : "");
  } else if (intent.intent === "next_sprint") {
    const subGoals = goalState.subGoals ?? 0;
    const topRec   = goalState.topRec;
    const score    = learnState.learningScore ?? 0;
    answer = `**MemoryOS — Próximo Sprint Recomendado**\n\n`
      + `Com base na execução ao vivo do Goal Intelligence Engine (${subGoals} sub-objetivos analisados):\n\n`
      + (topRec ? `**Recomendação principal:** ${topRec}\n\n` : "")
      + `**Learning score do pipeline:** ${score}\n`
      + `**Pipeline:** ${executed.length} estágios executados com sucesso\n`
      + (degraded ? `\n⚠️ Análise parcial: ${degradationReason}` : "");
  } else if (intent.intent === "repository_analysis") {
    const repoCount   = repoState.repoCount   ?? 0;
    const branchCount = repoState.branchCount ?? 0;
    const commitCount = repoState.commitCount ?? 0;
    if (connectors.includes("github")) {
      answer = `**MemoryOS — Análise do Repositório**\n\n`
        + `**Repositórios:** ${repoCount}\n`
        + `**Branches:** ${branchCount}\n`
        + `**Commits recentes:** ${commitCount}\n`
        + `**Target:** ${repoState.targetOwner ?? "N/A"}/${repoState.targetRepo ?? "N/A"}\n`;
    } else {
      answer = `**GitHub não configurado** — análise de repositório não disponível.\n\n`
        + `Para habilitar: acesse **Phase 5.3** e injete um GitHub Personal Access Token.\n\n`
        + `Dados disponíveis via Base44: ${appState.projectCount ?? 0} projetos, ${appState.totalRecords ?? 0} registros.`;
    }
  } else if (intent.intent === "application_analysis") {
    const ec = appState.entityCounts as Record<string, number> ?? {};
    answer = `**MemoryOS — Análise da Aplicação (Base44 Live)**\n\n`
      + `**Projetos:** ${appState.projectCount ?? 0}\n`
      + Object.entries(ec).map(([k, v]) => `**${k}:** ${v}`).join("\n")
      + `\n\n**Total de registros:** ${appState.totalRecords ?? 0}\n`
      + `**Plataforma:** ${appState.platform ?? "base44"}`;
  } else if (intent.intent === "connector_diagnostics") {
    answer = `**MemoryOS — Diagnóstico dos Conectores**\n\n`
      + `**Base44:** ${connectors.includes("base44") ? "✅ OPERATIONAL" : "⚠️ não disponível"}\n`
      + `**GitHub:** ${connectors.includes("github") ? "✅ OPERATIONAL" : "⚠️ NOT_CONFIGURED (token ausente)"}\n\n`
      + `**Pipeline:** ${pStatus} · ${executed.length}/${stages.length} estágios concluídos\n`
      + (degraded && degradationReason ? `\n**Degradação:** ${degradationReason}\n**Recuperação:** ${recoveryInfo}` : "");
  } else {
    // Generic cognitive answer for other intents
    const projCount = appState.projectCount ?? 0;
    const subGoals  = goalState.subGoals ?? 0;
    const topRec    = goalState.topRec;
    answer = `**Resposta cognitiva (${intent.intent.replace(/_/g, " ")})**\n\n`
      + `Executei o Live Cognitive Pipeline com ${executed.length} estágios.\n\n`
      + `**Dados ao vivo:** ${projCount} projeto(s) · ${subGoals} sub-objetivos detectados\n`
      + (topRec ? `**Recomendação:** ${topRec}\n` : "")
      + `**Conectores:** ${connectors.join(", ") || "nenhum autenticado"}\n`
      + `**Status:** ${pStatus}`
      + (degraded && degradationReason ? `\n\n⚠️ ${degradationReason}` : "");
  }

  // Append evidence footer
  if (evidence.length > 0) {
    answer += `\n\n---\n*Evidências: ${evidence.slice(0, 5).join(" · ")}*`;
  }
  answer += `\n*Exec ID: ${pipelineReport?.context?.executionId ?? "N/A"} · Conf: ${Math.round(conf * 100)}% · ${pipelineReport?.durationMs ?? 0}ms*`;

  return {
    id:                makeCCGId("answer"),
    requestId:         request.id,
    executionId:       pipelineReport?.context?.executionId ?? null,
    answer,
    source:            degraded ? "degraded_pipeline" : "live_pipeline",
    intent:            intent.intent,
    connectorsUsed:    connectors,
    stagesExecuted:    executed,
    evidenceSources:   evidence.slice(0, 10),
    confidence:        conf,
    durationMs:        Date.now() - t0,
    timestamp:         Date.now(),
    degraded,
    degradationReason,
    recoveryInfo,
    pipelineStatus:    pStatus,
  };
}

// ── ConversationCognitiveGateway ──────────────────────────────────────────────

export class ConversationCognitiveGateway {
  private readonly _pipeline   = new LiveCognitivePipeline();
  private readonly _composer   = new CognitiveAnswerComposer();
  private readonly _ghRouter   = new GitHubQueryRouter();
  private readonly _cis        = new ConnectorInvocationService();
  private readonly _repoResolver = new RepositoryResolver();
  private readonly _searchRanker = new SearchRanker();
  private _repoCache: { owner: string; repo: string; fetchedAt: number } | null = null;
  private readonly _diagnostics: GatewayDiagnostic[] = [];
  private _totalRequests     = 0;
  private _cognitiveRequests = 0;
  private _totalConfidence   = 0;
  private _totalDuration     = 0;

  // ── Main entry point ──────────────────────────────────────────────────────

  async process(
    userMessage: string,
    sessionId: string,
    projectId: string | null = null,
    historyLength = 0,
  ): Promise<CognitiveAnswer> {
    const t0 = Date.now();
    this._totalRequests++;

    const request: GatewayRequest = {
      id:            makeCCGId("req"),
      userMessage,
      sessionId,
      projectId,
      historyLength,
      timestamp:     Date.now(),
    };

    const intent = this.classifyIntent(userMessage);

    let answer: CognitiveAnswer;

    // ── Connector-Aware Query Routing (Phase 5.8.1) ──────────────────────────
    // GitHub-targeted questions bypass the LCP entirely and invoke the connector directly.
    const ghRoute = this._ghRouter.route(userMessage);
    if (ghRoute.isGitHubQuery && ghRoute.capability) {
      this._cognitiveRequests++;

      let capability = ghRoute.capability;
      let payload    = { ...ghRoute.payload };

      // EF-58.1.1: Repository Resolution — use RepositoryResolver for any cap needing owner/repo
      const needsRepo = !["repos.list", "auth.user"].includes(capability);
      if (needsRepo && (!payload.owner || !payload.repo)) {
        const resolved = await this._resolveRepository(userMessage, projectId);
        if (resolved) {
          payload.owner = resolved.owner;
          payload.repo  = resolved.repo;
          if (resolved.needsConfirmation) {
            // Return disambiguation message instead of executing
            const disambig: CognitiveAnswer = {
              id:                makeCCGId("answer"),
              requestId:         request.id,
              executionId:       null,
              answer:            this._repoResolver.buildConfirmationMessage(resolved.candidates),
              source:            "conversation_memory" as AnswerSource,
              intent:            "repository_analysis",
              connectorsUsed:    [],
              stagesExecuted:    [],
              evidenceSources:   [`${resolved.candidates.length} repositories found`],
              confidence:        resolved.confidence,
              durationMs:        Date.now() - t0,
              timestamp:         Date.now(),
              degraded:          false,
              degradationReason: null,
              recoveryInfo:      null,
              pipelineStatus:    "AWAITING_CONFIRMATION",
            };
            this._diagnostics.push({ requestId: request.id, userMessage, intent, pipelineInvoked: false, answer: disambig, timestamp: Date.now() });
            return disambig;
          }
        } else {
          // No repos found or NOT_CONFIGURED — fallback to repos.list
          capability = "repos.list";
          payload    = {};
        }
      }

      const invocationResult = await this._cis.invoke(
        "github",
        capability,
        payload,
        { originComponent: "ConversationCognitiveGateway", reason: `User query: ${capability}`, goalId: null },
      );

      if (invocationResult.record.status === "SUCCESS" && invocationResult.result?.data) {
        let connectorData = invocationResult.result.data as Record<string, unknown>;

        // EF-58.1.2: Apply search ranking for search.* capabilities
        if (capability.startsWith("search.") && (connectorData as any).items) {
          const ranked = this._searchRanker.rank((connectorData as any).items, userMessage);
          connectorData = { ...connectorData, items: ranked, _ranked: true };
        }

        const evidence = [
          `GitHub: ${capability}`,
          `Repo: ${payload.owner ?? "—"}/${payload.repo ?? "—"}`,
          `Confidence: ${Math.round(ghRoute.confidence * 100)}%`,
          `ExecId: ${invocationResult.record.id?.slice(-8)}`,
          `Duration: ${invocationResult.record.durationMs}ms`,
        ];
        const composed = this._composer.composeFromConnectorResult(
          userMessage,
          capability,
          connectorData,
          evidence,
          invocationResult.record.id ?? null,
          Date.now() - t0,
        );
        answer = {
          id:                makeCCGId("answer"),
          requestId:         request.id,
          executionId:       invocationResult.record.id ?? null,
          answer:            composed.narrative,
          source:            "live_pipeline" as AnswerSource,
          intent:            "repository_analysis",
          connectorsUsed:    ["github"],
          stagesExecuted:    [capability],
          evidenceSources:   evidence,
          confidence:        0.95,
          durationMs:        Date.now() - t0,
          timestamp:         Date.now(),
          degraded:          false,
          degradationReason: null,
          recoveryInfo:      null,
          pipelineStatus:    "CONNECTOR_DIRECT",
        };
      } else {
        // EF-58.1.12: Graceful fallback — never expose raw validation errors
        const notConfigured = invocationResult.record.status === "NOT_CONFIGURED";
        const rawError = invocationResult.record.error ?? "";
        const userFriendlyError = notConfigured
          ? "GitHub is not connected yet. Please add your GitHub token in the Phase 5.7.0 dashboard to enable repository queries."
          : rawError.includes("owner and repo required")
            ? "I could not determine which repository to inspect. Please specify the repository name in your question."
            : rawError.includes("not found")
              ? `The requested file or repository was not found. Please verify the path and try again.`
              : "GitHub query could not be completed. Please try again or check your connection.";
        answer = {
          id:                makeCCGId("answer"),
          requestId:         request.id,
          executionId:       null,
          answer:            userFriendlyError,
          source:            "degraded_pipeline" as AnswerSource,
          intent:            "repository_analysis",
          connectorsUsed:    [],
          stagesExecuted:    [],
          evidenceSources:   [],
          confidence:        0,
          durationMs:        Date.now() - t0,
          timestamp:         Date.now(),
          degraded:          true,
          degradationReason: invocationResult.record.error ?? "GitHub not configured",
          recoveryInfo:      notConfigured ? "Inject a GitHub PAT in Phase 5.7.0 dashboard" : null,
          pipelineStatus:    invocationResult.record.status,
        };
      }

      this._totalConfidence += answer.confidence;
      this._totalDuration   += answer.durationMs;
      this._diagnostics.push({ requestId: request.id, userMessage, intent, pipelineInvoked: false, answer, timestamp: Date.now() });
      if (this._diagnostics.length > 100) this._diagnostics.splice(0, this._diagnostics.length - 100);
      return answer;
    }

    if (intent.requiresCognitive) {
      this._cognitiveRequests++;
      // Invoke Live Cognitive Pipeline — gateway never touches connectors directly
      const pipelineReport = await this._pipeline.execute({
        projectId:        projectId ?? "conversation",
        goalId:           intent.intent,
        userApprovalGiven: false,
      });
      // CognitiveAnswerComposer (Phase 5.6.3) — presentation layer
      const snapshot = pipelineReport?.snapshot ?? {};
      const composed = this._composer.compose({
        userMessage:    userMessage,
        intent:         intent.intent,
        snapshot:       snapshot as Record<string, unknown>,
        pipelineReport: pipelineReport as Record<string, unknown>,
        evidence:       (snapshot as any)?.evidence ?? [],
        confidence:     (snapshot as any)?.confidence ?? 0.5,
        executionId:    pipelineReport?.context?.executionId ?? null,
        durationMs:     pipelineReport?.durationMs ?? 0,
      });

      // Build CognitiveAnswer from ComposedAnswer
      const legacyAnswer = generateAnswer(request, intent, pipelineReport);
      answer = {
        ...legacyAnswer,
        answer: composed.narrative || legacyAnswer.answer,
        degraded: composed.degraded,
        degradationReason: composed.degradationNote,
      };
    } else {
      // Pure conversation — no pipeline needed
      answer = {
        id:                makeCCGId("answer"),
        requestId:         request.id,
        executionId:       null,
        answer:            "", // caller uses their own response
        source:            "conversation_memory",
        intent:            intent.intent,
        connectorsUsed:    [],
        stagesExecuted:    [],
        evidenceSources:   [],
        confidence:        0,
        durationMs:        Date.now() - t0,
        timestamp:         Date.now(),
        degraded:          false,
        degradationReason: null,
        recoveryInfo:      null,
        pipelineStatus:    null,
      };
    }

    this._totalConfidence += answer.confidence;
    this._totalDuration   += answer.durationMs;

    const diagnostic: GatewayDiagnostic = {
      requestId:       request.id,
      userMessage,
      intent,
      pipelineInvoked: intent.requiresCognitive,
      answer,
      timestamp:       Date.now(),
    };
    this._diagnostics.push(diagnostic);
    if (this._diagnostics.length > 100) this._diagnostics.splice(0, this._diagnostics.length - 100);

    return answer;
  }

  // ── Repository Resolution (EF-58.1.1) ────────────────────────────────────

  private async _resolveRepository(
    userMessage: string,
    projectId: string | null,
  ): Promise<{ owner: string; repo: string; confidence: number; needsConfirmation: boolean; candidates: any[] } | null> {
    // Use cache if fresh (< 5 minutes)
    if (this._repoCache && Date.now() - this._repoCache.fetchedAt < 5 * 60 * 1000) {
      return { owner: this._repoCache.owner, repo: this._repoCache.repo, confidence: 0.9, needsConfirmation: false, candidates: [] };
    }
    const reposInv = await this._cis.invoke("github", "repos.list", { per_page: 10 },
      { originComponent: "ConversationCognitiveGateway", reason: "Repository resolution" });
    if (reposInv.record.status !== "SUCCESS") return null;
    const items = (reposInv.result?.data as any)?.items ?? [];
    if (items.length === 0) return null;

    const resolved = this._repoResolver.resolve(items, userMessage, projectId);
    if (!resolved) return null;

    // Cache the best result
    if (!resolved.needsConfirmation) {
      this._repoCache = { owner: resolved.owner, repo: resolved.repo, fetchedAt: Date.now() };
    }
    return resolved;
  }

  // ── Intent classifier ─────────────────────────────────────────────────────

  classifyIntent(message: string): IntentClassification {
    const lower = message.toLowerCase();
    let bestIntent: CognitiveIntent = "general_conversation";
    let bestScore = 0;
    let matchedKeywords: string[] = [];
    let reasoning = "No cognitive keywords detected";

    for (const pattern of INTENT_PATTERNS) {
      const matched = pattern.keywords.filter(kw => lower.includes(kw));
      const score   = matched.length / pattern.keywords.length + matched.length * 0.1;
      if (score > bestScore) {
        bestScore       = score;
        bestIntent      = pattern.intent;
        matchedKeywords = matched;
        reasoning       = `Matched: ${matched.join(", ")}`;
      }
    }

    const confidence      = Math.min(bestScore * 2, 1);
    const requiresCognitive = bestIntent !== "general_conversation" && confidence > 0.05;

    return { intent: bestIntent, confidence, requiresCognitive, matchedKeywords, reasoning };
  }

  // ── Report ────────────────────────────────────────────────────────────────

  buildReport(): CCGReport {
    const n = this._totalRequests || 1;
    return {
      id:                makeCCGId("ccg_report"),
      generatedAt:       Date.now(),
      totalRequests:     this._totalRequests,
      cognitiveRequests: this._cognitiveRequests,
      fallbackRequests:  this._totalRequests - this._cognitiveRequests,
      avgConfidence:     Math.round((this._totalConfidence / n) * 100) / 100,
      avgDurationMs:     Math.round(this._totalDuration / n),
      recentDiagnostics: [...this._diagnostics].reverse().slice(0, 20),
    };
  }
}