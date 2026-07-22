/**
 * RuntimeCapabilityExecutor.ts — EF-42 Runtime Introspection Framework
 *
 * SRP: Executar capacidades internas do Runtime e produzir respostas
 *      diretamente a partir do estado interno — sem rede, sem LLM,
 *      sem Connectors, sem Planner.
 *
 * FONTES DE DADOS (exclusivas):
 *   - RuntimeContextLayer     (estado operacional)
 *   - ExecutionIntentManager  (intent persistido)
 *   - ExecutionResultSet      (items da ultima busca)
 *   - ConversationStore       (sessionId)
 *
 * CONTRATO:
 *   execute() sempre retorna { answer: string, data: unknown }.
 *   Nunca lanca excecao.
 *   Nunca bloqueia.
 */

import { runtimeContextLayer } from "@/lib/runtime-context/RuntimeContextLayer";
import { conversationStore }   from "@/lib/conversation-platform/ConversationStore";
import type { RuntimeCapabilityId } from "./RuntimeCapabilityRegistry";

export interface RuntimeExecutionResult {
  capabilityId: RuntimeCapabilityId;
  answer:       string;
  data:         unknown;
  durationMs:   number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _yn(v: unknown): string {
  return v != null && v !== "" ? "Sim" : "Nao";
}

function _fmt(v: unknown): string {
  if (v == null) return "(nenhum)";
  if (typeof v === "string" && v === "") return "(vazio)";
  return String(v);
}

// ── RuntimeCapabilityExecutor ─────────────────────────────────────────────────

export class RuntimeCapabilityExecutor {

  execute(capabilityId: RuntimeCapabilityId): RuntimeExecutionResult {
    const t0 = Date.now();
    let answer = "";
    let data: unknown = null;

    try {
      const state = runtimeContextLayer.get();

      switch (capabilityId) {

        // ── runtime.context.dump ────────────────────────────────────────────
        case "runtime.context.dump": {
          data = runtimeContextLayer.dump();
          const d = data as Record<string, unknown>;
          answer = `**RuntimeContext — Estado Completo**\n\n`
            + `**ExecutionId:** ${_fmt(d.currentExecutionId)}\n`
            + `**Goal:** ${_fmt(d.currentGoalType)}\n`
            + `**Connector:** ${_fmt(d.currentConnector)}\n`
            + `**Capability:** ${_fmt(d.currentCapability)}\n`
            + `**Dominio:** ${_fmt(d.currentDomain)}\n`
            + `**SessionId:** ${_fmt(d.sessionId)}\n`
            + `**Atualizado em:** ${d.updatedAt ? new Date(d.updatedAt as number).toISOString() : "(nunca)"}\n`
            + `**ResultSet:** ${d.currentResultSet != null ? `Sim (${(d.currentResultSet as any)?.items?.length ?? 0} itens)` : "Nao"}\n`
            + `**ExecutionIntent:** ${d.executionIntent != null ? `Sim (dominio: ${(d.executionIntent as any)?.domain})` : "Nao"}\n`
            + `\n\`\`\`json\n${JSON.stringify(d, null, 2).slice(0, 2000)}\n\`\`\``;
          break;
        }

        // ── runtime.context.get ─────────────────────────────────────────────
        case "runtime.context.get": {
          data = {
            executionId: state.currentExecutionId,
            goalType:    state.currentGoalType,
            connector:   state.currentConnector,
            capability:  state.currentCapability,
            domain:      state.currentDomain,
            sessionId:   state.sessionId,
            hasResultSet: state.currentResultSet != null,
            hasIntent:    state.executionIntent != null,
          };
          answer = `**RuntimeContext — Resumo**\n\n`
            + `- **Goal ativo:** ${_fmt(state.currentGoalType)}\n`
            + `- **Connector:** ${_fmt(state.currentConnector)}\n`
            + `- **Capability:** ${_fmt(state.currentCapability)}\n`
            + `- **Dominio:** ${_fmt(state.currentDomain)}\n`
            + `- **ResultSet:** ${state.currentResultSet != null ? `Sim (${state.currentResultSet.items.length} itens)` : "Nao"}\n`
            + `- **Intent:** ${_yn(state.executionIntent)}`;
          break;
        }

        // ── runtime.execution.get ───────────────────────────────────────────
        case "runtime.execution.get": {
          data = { executionId: state.currentExecutionId };
          answer = state.currentExecutionId
            ? `**ExecutionId atual:** \`${state.currentExecutionId}\``
            : `**ExecutionId atual:** Nao ha execucao registrada no contexto.\n\nIsso significa que nenhuma capability foi executada ainda nesta sessao, ou o contexto foi limpo.`;
          break;
        }

        // ── runtime.goal.get ────────────────────────────────────────────────
        case "runtime.goal.get": {
          data = { goalType: state.currentGoalType };
          answer = state.currentGoalType
            ? `**Goal ativo:** \`${state.currentGoalType}\``
            : `**Goal ativo:** Nao ha goal registrado no contexto.\n\nO sistema ainda nao executou nenhuma capability nesta sessao.`;
          break;
        }

        // ── runtime.connector.get ───────────────────────────────────────────
        case "runtime.connector.get": {
          data = { connector: state.currentConnector, capability: state.currentCapability };
          if (state.currentConnector) {
            answer = `**Connector ativo:** \`${state.currentConnector}\`\n`
              + `**Capability:** \`${_fmt(state.currentCapability)}\``;
          } else {
            answer = `**Connector ativo:** Nao ha connector registrado no contexto.\n\nNenhuma capability externa foi executada nesta sessao.`;
          }
          break;
        }

        // ── runtime.connector.status (EF-43B) ──────────────────────────────
        // Reads the ConversationStore connector slots to determine real
        // connection state. NEVER infers from conversation history.
        // Source of truth: what was actually persisted by a ConnectorContextBuilder.
        case "runtime.connector.status": {
          const KNOWN = ["github", "google-drive", "gmail", "google-calendar"] as const;
          const LABELS: Record<string, string> = {
            "github":          "GitHub",
            "google-drive":    "Google Drive",
            "gmail":           "Gmail",
            "google-calendar": "Google Calendar",
          };

          const statusMap: Record<string, { connected: boolean; lastUsed?: number; detail: string }> = {};

          for (const id of KNOWN) {
            const ctx = conversationStore.getConnectorContext(id);
            if (ctx && ctx.connectorId === id) {
              const updatedAt = (ctx as any).updatedAt as number | undefined;
              statusMap[id] = {
                connected: true,
                lastUsed:  updatedAt,
                detail:    updatedAt
                  ? `Ultimo uso: ${new Date(updatedAt).toLocaleString("pt-BR")}`
                  : "Conectado (sem timestamp)",
              };
            } else {
              // Also check if the RuntimeContext records this connector as last used
              const rclConnector = state.currentConnector;
              if (rclConnector === id && state.currentExecutionId) {
                statusMap[id] = {
                  connected: true,
                  lastUsed:  state.updatedAt,
                  detail:    `Ativo no RuntimeContext (executionId: ${state.currentExecutionId.slice(-8)})`,
                };
              } else {
                statusMap[id] = { connected: false, detail: "Nenhuma execucao registrada nesta sessao" };
              }
            }
          }

          data = statusMap;

          const lines = KNOWN.map((id) => {
            const s = statusMap[id];
            const icon = s.connected ? "✅" : "❌";
            return `${icon} **${LABELS[id]}:** ${s.connected ? "Conectado" : "Nao conectado"} — ${s.detail}`;
          });

          const anyConnected = KNOWN.some((id) => statusMap[id].connected);
          const rclNote = state.currentConnector
            ? `\n\n> RuntimeContext registra \`${state.currentConnector}\` como ultimo connector ativo (executionId: \`${(state.currentExecutionId ?? "").slice(-12)}\`)`
            : "\n\n> RuntimeContext nao registra nenhum connector ativo nesta sessao.";

          answer = `**Status dos Conectores** _(fonte: RuntimeContext — EF-43B)_\n\n`
            + lines.join("\n")
            + rclNote
            + (anyConnected ? "" : "\n\n> Nenhum conector foi utilizado nesta sessao. Execute uma operacao com um conector para registrar o estado.");

          break;
        }

        // ── runtime.capability.get ──────────────────────────────────────────
        case "runtime.capability.get": {
          data = { capability: state.currentCapability, connector: state.currentConnector };
          answer = state.currentCapability
            ? `**Capability ativa:** \`${state.currentCapability}\` (connector: \`${_fmt(state.currentConnector)}\`)`
            : `**Capability ativa:** Nenhuma capability registrada no contexto.`;
          break;
        }

        // ── runtime.domain.get ──────────────────────────────────────────────
        case "runtime.domain.get": {
          data = { domain: state.currentDomain };
          answer = `**Dominio ativo:** \`${state.currentDomain}\`\n\n`
            + `Dominios possiveis: \`github\`, \`google-drive\`, \`gmail\`, \`google-calendar\`, \`general\`.`;
          break;
        }

        // ── runtime.artifact.get ────────────────────────────────────────────
        case "runtime.artifact.get": {
          const art = state.currentArtifact;
          data = art;
          const hasArt = Object.keys(art).length > 0;
          if (hasArt) {
            answer = `**Artifact atual:**\n`
              + (art.owner ? `- **Owner:** \`${art.owner}\`\n` : "")
              + (art.repo  ? `- **Repo:** \`${art.repo}\`\n` : "")
              + (art.path  ? `- **Path:** \`${art.path}\`\n` : "")
              + (art.fileId ? `- **FileId:** \`${art.fileId}\`\n` : "")
              + (typeof art.cursorIndex === "number" ? `- **CursorIndex:** ${art.cursorIndex}\n` : "");
          } else {
            answer = `**Artifact atual:** Nenhum artefato registrado no contexto.`;
          }
          break;
        }

        // ── runtime.resultset.get ───────────────────────────────────────────
        case "runtime.resultset.get": {
          const rs = state.currentResultSet;
          data = rs;
          if (rs && rs.items.length > 0) {
            answer = `**ResultSet ativo:** Sim\n\n`
              + `- **ID:** \`${rs.id}\`\n`
              + `- **Connector:** \`${rs.connector}\`\n`
              + `- **Capability:** \`${rs.capability}\`\n`
              + `- **Tipo:** \`${rs.entityType}\`\n`
              + `- **Itens:** ${rs.items.length}\n`
              + `- **Item selecionado:** ${rs.selectedIndex != null ? `#${rs.selectedIndex} — ${rs.items[rs.selectedIndex]?.displayName ?? "(sem nome)"}` : "Nenhum"}\n`
              + `\n**Primeiros itens:**\n`
              + rs.items.slice(0, 5).map((item, i) => `  ${i + 1}. ${item.displayName}`).join("\n");
          } else {
            answer = `**ResultSet ativo:** Nao\n\nNenhum resultado de busca foi armazenado no contexto atual.\n\nO ResultSet e populado automaticamente apos execucoes como: listar emails, buscar arquivos, listar repositorios, etc.`;
          }
          break;
        }

        // ── runtime.resultset.items ─────────────────────────────────────────
        case "runtime.resultset.items": {
          const rs = state.currentResultSet;
          data = rs?.items ?? [];
          if (rs && rs.items.length > 0) {
            const selected = rs.selectedIndex != null ? rs.items[rs.selectedIndex] : null;
            answer = `**ExecutionResultSet — ${rs.items.length} itens** (${rs.entityType} · ${rs.connector})\n\n`
              + rs.items.map((item, i) => {
                const mark = rs.selectedIndex === i ? " ← **selecionado**" : "";
                return `${i + 1}. \`${item.displayName}\`${mark}`;
              }).join("\n")
              + (selected ? `\n\n**Item selecionado:** \`${selected.displayName}\`` : "");
          } else {
            answer = `**ResultSet:** Nenhum item disponivel no contexto atual.`;
          }
          break;
        }

        // ── runtime.intent.get ──────────────────────────────────────────────
        case "runtime.intent.get": {
          const intent = state.executionIntent;
          data = intent;
          if (intent) {
            answer = `**ExecutionIntent ativo:** Sim\n\n`
              + `- **Dominio:** \`${intent.domain}\`\n`
              + `- **Proposito:** \`${intent.purpose}\`\n`
              + `- **Tipo de artefato:** \`${intent.artifactType}\`\n`
              + `- **Modo:** \`${intent.continuationMode}\`\n`
              + `- **ExecutionId:** \`${intent.executionId}\`\n`
              + `- **Atualizado:** ${new Date(intent.updatedAt).toISOString()}`;
          } else {
            answer = `**ExecutionIntent ativo:** Nao\n\nNenhum intent foi registrado nesta sessao.\n\nO ExecutionIntent e criado automaticamente apos execucoes bem-sucedidas com connectors externos (GitHub, Drive, Gmail, Calendar).`;
          }
          break;
        }

        // ── runtime.continuation.get ────────────────────────────────────────
        case "runtime.continuation.get": {
          const intent = state.executionIntent;
          const hasContinuation = intent != null && intent.continuationMode === "navigation";
          data = { hasContinuation, intent };
          if (hasContinuation) {
            answer = `**Continuacao pendente:** Sim\n\n`
              + `O contexto atual suporta navegacao ("proximo", "anterior", "abra o primeiro").\n\n`
              + `- **Dominio:** \`${intent!.domain}\`\n`
              + `- **Proposito:** \`${intent!.purpose}\`\n`
              + `- **Modo:** \`${intent!.continuationMode}\``;
          } else if (intent) {
            answer = `**Continuacao pendente:** Nao (modo standalone)\n\nHa um ExecutionIntent, mas nao suporta navegacao sequencial.`;
          } else {
            answer = `**Continuacao pendente:** Nao\n\nNao ha ExecutionIntent registrado nesta sessao.`;
          }
          break;
        }

        // ── runtime.session.get ─────────────────────────────────────────────
        case "runtime.session.get": {
          data = { sessionId: state.sessionId };
          answer = state.sessionId
            ? `**SessionId ativo:** \`${state.sessionId}\``
            : `**SessionId:** Nao ha sessao registrada no contexto de runtime.`;
          break;
        }

        // ── runtime.pipeline.get ────────────────────────────────────────────
        case "runtime.pipeline.get": {
          data = {
            executionId:   state.currentExecutionId,
            goalType:      state.currentGoalType,
            connector:     state.currentConnector,
            capability:    state.currentCapability,
            domain:        state.currentDomain,
            hasResultSet:  state.currentResultSet != null,
            hasIntent:     state.executionIntent != null,
          };
          answer = `**Pipeline — Ultimo Estado Registrado**\n\n`
            + `- **ExecutionId:** ${_fmt(state.currentExecutionId)}\n`
            + `- **Goal:** ${_fmt(state.currentGoalType)}\n`
            + `- **Connector → Capability:** ${_fmt(state.currentConnector)} → ${_fmt(state.currentCapability)}\n`
            + `- **Dominio:** ${_fmt(state.currentDomain)}\n`
            + `- **ResultSet:** ${state.currentResultSet != null ? `Sim (${state.currentResultSet.items.length} itens)` : "Nao"}\n`
            + `- **Intent:** ${_yn(state.executionIntent)}`;
          break;
        }

        default: {
          answer = `Capability de runtime nao reconhecida: \`${capabilityId}\`.`;
        }
      }
    } catch (e) {
      answer = `Erro ao executar introspeccao de runtime: ${String(e)}`;
      data = { error: String(e) };
    }

    return { capabilityId, answer, data, durationMs: Date.now() - t0 };
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

const _KEY = "__RUNTIME_CAPABILITY_EXECUTOR__";
if (!(globalThis as unknown as Record<string, unknown>)[_KEY]) {
  (globalThis as unknown as Record<string, unknown>)[_KEY] = new RuntimeCapabilityExecutor();
}

export const runtimeCapabilityExecutor: RuntimeCapabilityExecutor = (
  globalThis as unknown as Record<string, RuntimeCapabilityExecutor>
)[_KEY];