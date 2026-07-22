/**
 * ExecutionResultSetBuilder.ts — EF-41 (Unified Execution Result Set)
 *
 * RESPONSABILIDADE UNICA:
 *   Converter connectorData (saida do ConnectorResultSynthesizer)
 *   em um ExecutionResultSet navegavel.
 *
 * DESIGN:
 *   - Zero logica especifica de Connector (o Builder nao sabe qual Connector rodou).
 *   - Zero chamadas de rede.
 *   - Zero side effects.
 *   - Estrategia baseada em heuristica: tenta extrair "items" de varios shapes
 *     comuns de output de Connectors.
 *
 * HEURISTICA DE EXTRACAO:
 *   1. output.items  → array mais comum (GitHub, Drive, Calendar, Gmail inbox)
 *   2. output.messages → Gmail readInbox alternativo
 *   3. output.events → Calendar alternativo
 *   4. output.files  → Drive alternativo
 *   5. output.repositories → GitHub alternativo
 *   6. output diretamente como array
 *   7. Objeto unico → wraps como [item] (ex: getFile, readMessage)
 *
 * ENTITYTYPE:
 *   Inferido do capability name (sem conhecimento do Connector):
 *   "repos.list"       → "repository"
 *   "files.list"       → "file"
 *   "search.*"         → "file"
 *   "readInbox"        → "email"
 *   "searchEmails"     → "email"
 *   "events.list"      → "event"
 *   default            → "item"
 *
 * COMPATIBILIDADE:
 *   Nenhum Connector e modificado.
 *   Nenhum Router e modificado.
 *   Nenhum Planner e modificado.
 *   build() retorna null se nao houver itens extraiveis.
 */

import {
  type ExecutionResultSet,
  type ExecutionResultItem,
  makeResultSetId,
  makeResultItemId,
} from "./ExecutionResultSet";

// ── entityType inference ───────────────────────────────────────────────────────

function _inferEntityType(capability: string): string {
  const c = capability.toLowerCase();
  if (c.includes("repo"))          return "repository";
  if (c.includes("branch"))        return "branch";
  if (c.includes("commit"))        return "commit";
  if (c.includes("pull") || c.includes("pr")) return "pull_request";
  if (c.includes("issue"))         return "issue";
  if (c.includes("file") || c.includes("search.") || c.includes("search.symbol")) return "file";
  if (c.includes("message") || c.includes("email") || c.includes("inbox") || c.includes("mail")) return "email";
  if (c.includes("event") || c.includes("calendar")) return "event";
  if (c.includes("drive"))         return "file";
  return "item";
}

// ── displayName extraction ────────────────────────────────────────────────────

function _extractDisplayName(raw: Record<string, unknown>, entityType: string): string {
  // Tenta campos comuns em ordem de preferencia
  const candidates = [
    raw["full_name"],     // GitHub repos: "owner/repo"
    raw["name"],          // universal
    raw["path"],          // arquivos
    raw["title"],         // issues, PRs, eventos
    raw["subject"],       // emails
    raw["id"],            // fallback por id
    raw["sha"]?.toString().slice(0, 8),  // commits
  ];
  for (const c of candidates) {
    if (c && typeof c === "string" && c.trim()) return c.trim();
  }
  return `${entityType} item`;
}

// ── reference extraction ──────────────────────────────────────────────────────

/**
 * Extrai a referencia opaca que permite ao Connector buscar o item
 * em uma execucao futura.
 *
 * Nenhuma logica especifica de Connector.
 * Preserva o objeto raw inteiro como referencia padrao,
 * mas tenta extrair campos de identidade conhecidos.
 */
function _extractReference(raw: Record<string, unknown>): unknown {
  // Preferir objeto de identidade minimo sobre o objeto inteiro
  const identity: Record<string, unknown> = {};

  if (raw["owner"])      identity["owner"]     = raw["owner"];
  if (raw["name"])       identity["name"]      = raw["name"];
  if (raw["full_name"])  identity["full_name"] = raw["full_name"];
  if (raw["path"])       identity["path"]      = raw["path"];
  if (raw["id"])         identity["id"]        = raw["id"];
  if (raw["sha"])        identity["sha"]       = raw["sha"];
  if (raw["number"])     identity["number"]    = raw["number"];  // PR/issue number
  if (raw["html_url"])   identity["html_url"]  = raw["html_url"];
  if (raw["fileId"])     identity["fileId"]    = raw["fileId"];
  if (raw["messageId"])  identity["messageId"] = raw["messageId"];
  if (raw["threadId"])   identity["threadId"]  = raw["threadId"];
  if (raw["calendarId"]) identity["calendarId"]= raw["calendarId"];
  if (raw["eventId"])    identity["eventId"]   = raw["eventId"];

  return Object.keys(identity).length > 0 ? identity : raw;
}

// ── array extraction heuristic ────────────────────────────────────────────────

function _extractItemsArray(output: Record<string, unknown>): unknown[] | null {
  // Shapes comuns em ordem de prioridade
  if (Array.isArray(output["items"]))        return output["items"] as unknown[];
  if (Array.isArray(output["messages"]))     return output["messages"] as unknown[];
  if (Array.isArray(output["events"]))       return output["events"] as unknown[];
  if (Array.isArray(output["files"]))        return output["files"] as unknown[];
  if (Array.isArray(output["repositories"])) return output["repositories"] as unknown[];
  if (Array.isArray(output["branches"]))     return output["branches"] as unknown[];
  if (Array.isArray(output["commits"]))      return output["commits"] as unknown[];
  if (Array.isArray(output["pullRequests"])) return output["pullRequests"] as unknown[];
  if (Array.isArray(output["issues"]))       return output["issues"] as unknown[];
  if (Array.isArray(output["records"]))      return output["records"] as unknown[];
  return null;
}

// ── ExecutionResultSetBuilder ─────────────────────────────────────────────────

export class ExecutionResultSetBuilder {

  /**
   * Constroi um ExecutionResultSet a partir do connectorData produzido pelo
   * ConnectorResultSynthesizer.
   *
   * connectorData e o array: Array<{ connector, capability, output }>
   *
   * Retorna null se nenhum item navegavel for encontrado
   * (ex: execucao de escrita, objeto unico sem lista, erro).
   */
  build(
    connectorData: Array<{ connector: string; capability: string; output: unknown }>,
  ): ExecutionResultSet | null {
    if (!connectorData || connectorData.length === 0) return null;

    // Usa o primeiro step com output presente
    const step = connectorData.find((s) => s.output !== null && s.output !== undefined);
    if (!step) return null;

    const { connector, capability, output } = step;
    const entityType = _inferEntityType(capability);
    const setId      = makeResultSetId();

    let rawItems: unknown[] | null = null;

    // output pode ser Record ou array ou primitivo
    if (Array.isArray(output)) {
      rawItems = output as unknown[];
    } else if (output && typeof output === "object") {
      rawItems = _extractItemsArray(output as Record<string, unknown>);

      // Se nao houver lista mas houver um objeto unico navegavel → wrap
      if (!rawItems) {
        const single = output as Record<string, unknown>;
        // Um objeto unico so vira ResultSet se tiver pelo menos um campo de identidade
        const hasIdentity = !!(single["id"] || single["name"] || single["path"] ||
                                single["sha"] || single["subject"] || single["title"]);
        if (hasIdentity) {
          rawItems = [single];
        }
      }
    }

    if (!rawItems || rawItems.length === 0) return null;

    const items: ExecutionResultItem[] = rawItems
      .slice(0, 50)  // limite de segurança
      .map((raw, idx) => {
        const r = (raw && typeof raw === "object" ? raw : { value: raw }) as Record<string, unknown>;
        return {
          id:          makeResultItemId(setId, idx),
          label:       `${entityType} ${idx + 1}`,
          displayName: _extractDisplayName(r, entityType),
          reference:   _extractReference(r),
          metadata:    r,
        };
      });

    if (items.length === 0) return null;

    const resultSet: ExecutionResultSet = {
      id:            setId,
      connector,
      capability,
      entityType,
      createdAt:     Date.now(),
      selectedIndex: null,
      items,
    };

    console.log("[UERS] ExecutionResultSet built", {
      id:         setId,
      connector,
      capability,
      entityType,
      itemCount:  items.length,
      preview:    items.slice(0, 3).map((i) => i.displayName),
    });

    return resultSet;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

export const executionResultSetBuilder = new ExecutionResultSetBuilder();