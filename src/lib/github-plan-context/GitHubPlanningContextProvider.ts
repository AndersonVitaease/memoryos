/**
 * GitHubPlanningContextProvider.ts — EXPERIMENTAL (Sprint EXP-GITHUB-PLAN)
 *
 * EXPERIMENTO REVERSIVEL.
 *
 * REVERSAO:
 *   1. Apagar este arquivo.
 *   2. Remover as 3 linhas marcadas [EXP-GITHUB-PLAN] em ConversationPipeline.ts.
 *   Nenhum outro arquivo precisa ser alterado.
 *
 * RESPONSABILIDADE UNICA:
 *   Receber um ExecutionPlan.
 *   Se nao houver steps com connector="github" → retornar inalterado.
 *   Se houver → resolver owner/repo/branch via GitHubContextBuilder (ConversationStore)
 *     com fallback para OfficialRuntimeBridge.invokeCompatGuarded("github","repos.list").
 *   Retornar um NOVO ExecutionPlan com os steps enriquecidos.
 *
 * NAO altera:
 *   - GoalCapabilityRegistry
 *   - ConversationPlanningEngine
 *   - GoalBridge
 *   - RepositoryResolver (usado internamente via OfficialRuntimeBridge se necessario)
 *   - GitHubConnector
 *   - ConversationRuntimeEngine
 *   - UniversalConnectorRouter
 *
 * DESIGN:
 *   Fonte primaria: ConversationStore.getConnectorContext("github")
 *     — context populado pelo GitHubContextBuilder apos qualquer
 *       execucao previa de repos.list, repos.get etc.
 *   Fonte secundaria: OfficialRuntimeBridge.invokeCompatGuarded("github","repos.list")
 *     — usado apenas quando context nao esta disponivel.
 *     — reutiliza exatamente o mesmo bridge que o CCG usa, sem duplicar logica.
 *
 * PARAMETROS INJETADOS nos steps github:
 *   owner, repo, branch
 *   Os parametros originais (query, path, etc.) sao preservados intactos.
 */

import type { ExecutionPlan, ExecutionStep } from "@/lib/planning-engine-e022/ExecutionPlanTypes";

// ── Resultado da resolucao ────────────────────────────────────────────────────

export interface GitHubRepoContext {
  owner:  string;
  repo:   string;
  branch: string | null;
  source: "conversation_store" | "repos_list_api" | "not_resolved";
}

// ── Provedor ──────────────────────────────────────────────────────────────────

export class GitHubPlanningContextProvider {

  /**
   * Enriquece um ExecutionPlan com owner/repo/branch para steps GitHub.
   * Retorna sempre um ExecutionPlan valido — nunca lanca excecao.
   * Se a resolucao falhar, retorna o plano original inalterado.
   */
  async enrich(plan: ExecutionPlan, userMessage: string): Promise<ExecutionPlan> {
    // Verifica se existe ao menos um step GitHub
    const hasGitHub = plan.steps.some((s) => s.connector === "github");
    if (!hasGitHub) return plan;

    const t0 = Date.now();

    console.log("[EXP-GITHUB-PLAN] enrich() called", {
      planId:     plan.id,
      goalType:   plan.goalType,
      stepCount:  plan.steps.length,
      userMessage: userMessage.slice(0, 80),
    });

    // Registrar estado BEFORE
    const before = plan.steps
      .filter((s) => s.connector === "github")
      .map((s) => ({ id: s.id, connector: s.connector, capability: s.capability, parameters: s.parameters }));

    console.log("[EXP-GITHUB-PLAN] Plan Before (GitHub steps):", JSON.stringify(before, null, 2));

    // Resolver contexto do repositorio
    const ctx = await this._resolveRepoContext(userMessage);

    console.log("[EXP-GITHUB-PLAN] Repository Resolved:", {
      source: ctx.source,
      owner:  ctx.owner  || "(not resolved)",
      repo:   ctx.repo   || "(not resolved)",
      branch: ctx.branch || "(not resolved)",
      durationMs: Date.now() - t0,
    });

    // Sem contexto — retornar plano inalterado
    if (ctx.source === "not_resolved" || !ctx.owner || !ctx.repo) {
      console.log("[EXP-GITHUB-PLAN] No repo context — plan returned unchanged");
      return plan;
    }

    // Enriquecer steps GitHub com owner/repo/branch
    const enrichedSteps: ExecutionStep[] = plan.steps.map((step) => {
      if (step.connector !== "github") return step;

      const enrichedParams = Object.freeze({
        ...step.parameters,
        owner:  ctx.owner,
        repo:   ctx.repo,
        ...(ctx.branch ? { branch: ctx.branch } : {}),
      });

      return Object.freeze({
        id:         step.id,
        connector:  step.connector,
        capability: step.capability,
        parameters: enrichedParams,
      });
    });

    // Construir novo plano imutavel
    const enrichedPlan: ExecutionPlan = Object.freeze({
      ...plan,
      steps: Object.freeze(enrichedSteps),
    });

    // Registrar estado AFTER
    const after = enrichedSteps
      .filter((s) => s.connector === "github")
      .map((s) => ({ id: s.id, connector: s.connector, capability: s.capability, parameters: s.parameters }));

    console.log("[EXP-GITHUB-PLAN] Plan After (GitHub steps):", JSON.stringify(after, null, 2));

    return enrichedPlan;
  }

  // ── Resolucao do contexto ─────────────────────────────────────────────────

  private async _resolveRepoContext(userMessage: string): Promise<GitHubRepoContext> {

    // ── FONTE 1: ConversationStore.getConnectorContext("github") ──────────────
    // Populado pelo GitHubContextBuilder apos qualquer execucao previa de GitHub.
    try {
      const { conversationStore } = await import("@/lib/conversation-platform/ConversationStore");
      const { readGitHubContext } = await import("@/lib/connector-context/providers/GitHubContextBuilder");

      const rawCtx = conversationStore.getConnectorContext("github");
      const ghCtx  = readGitHubContext(rawCtx);

      if (ghCtx && ghCtx.owner && ghCtx.repo) {
        console.log("[EXP-GITHUB-PLAN] Source: conversation_store →", {
          owner:  ghCtx.owner,
          repo:   ghCtx.repo,
          branch: ghCtx.defaultBranch,
        });
        return {
          owner:  ghCtx.owner,
          repo:   ghCtx.repo,
          branch: ghCtx.defaultBranch ?? null,
          source: "conversation_store",
        };
      }
    } catch (e) {
      console.log("[EXP-GITHUB-PLAN] ConversationStore read failed — trying repos.list", String(e));
    }

    // ── FONTE 2: repos.list via OfficialRuntimeBridge ─────────────────────────
    // Mesmo bridge que o CCG usa — zero duplicacao de logica.
    try {
      const { officialRuntimeBridge } = await import("@/lib/cognitive-connector/OfficialRuntimeBridge");
      const { RepositoryResolver }   = await import("@/lib/github-deep-analysis/RepositoryResolver");

      const reposResult = await officialRuntimeBridge.invokeCompatGuarded(
        "github",
        "repos.list",
        { per_page: 10 },
        { originComponent: "GitHubPlanningContextProvider", reason: "Resolve repo context for plan enrichment", goalId: null },
      );

      if (reposResult.record.status === "SUCCESS") {
        const items = (reposResult.result?.data as any)?.items ?? [];
        if (items.length > 0) {
          const resolver = new RepositoryResolver();
          const resolved = resolver.resolve(items, userMessage, null);

          if (resolved && !resolved.needsConfirmation) {
            console.log("[EXP-GITHUB-PLAN] Source: repos_list_api →", {
              owner:      resolved.owner,
              repo:       resolved.repo,
              confidence: resolved.confidence,
            });
            // Tenta extrair default_branch do item resolvido
            const matchedItem = items.find(
              (i: any) => i.owner === resolved.owner && i.name === resolved.repo,
            );
            return {
              owner:  resolved.owner,
              repo:   resolved.repo,
              branch: matchedItem?.default_branch ?? null,
              source: "repos_list_api",
            };
          }

          // Nenhum repo especifico identificado — usar o primeiro (mais recente)
          const first = items[0];
          if (first?.owner && first?.name) {
            console.log("[EXP-GITHUB-PLAN] Source: repos_list_api (first repo fallback) →", {
              owner:  first.owner,
              repo:   first.name,
            });
            return {
              owner:  String(first.owner),
              repo:   String(first.name),
              branch: typeof first.default_branch === "string" ? first.default_branch : null,
              source: "repos_list_api",
            };
          }
        }
      } else {
        console.log("[EXP-GITHUB-PLAN] repos.list failed →", {
          status: reposResult.record.status,
          error:  reposResult.record.error,
        });
      }
    } catch (e) {
      console.log("[EXP-GITHUB-PLAN] repos.list exception —", String(e));
    }

    // Nenhuma fonte disponivel
    return { owner: "", repo: "", branch: null, source: "not_resolved" };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__GITHUB_PLANNING_CTX_PROVIDER__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new GitHubPlanningContextProvider();
}

export const gitHubPlanningContextProvider: GitHubPlanningContextProvider = (
  globalThis as unknown as Record<string, GitHubPlanningContextProvider>
)[_KEY];