/**
 * WatchPlannerBridge.ts — WE-04
 *
 * Integração entre o Planner cognitivo e o Watch Engine.
 * Detecta intenções do tipo "me avise quando...", "monitore...", "fique de olho..."
 * e cria automaticamente o Watch correspondente.
 *
 * Fluxo:
 *   1. detectIntent(message) → WatchIntent | null
 *   2. Se detectado: watchDeduplicator.check() → criar ou devolver existing
 *   3. Se novo: watchRegistry.create() + retornar confirmação para o usuário
 *
 * Princípios:
 * - Nunca bloqueia o pipeline de resposta (fire-and-forget safe)
 * - Não usa eval()
 * - Toda criação passa pelo WatchDeduplicator
 */

import { base44 } from "@/api/base44Client";
import { watchRegistry } from "./WatchRegistry";
import { watchDeduplicator } from "./WatchDeduplicator";
import type { WatchIntent, ConditionTree } from "./WatchTypes";

// ── Padrões de intenção de monitoramento ─────────────────────────────────────

const INTENT_PATTERNS = [
  /me\s+avis[ea]/i,
  /me\s+notifi[cq]/i,
  /manda\s+(um\s+)?aviso/i,
  /monitore?\b/i,
  /fique\s+de\s+olho/i,
  /watch\b/i,
  /alerta\s+(quando|se)/i,
  /quando\s+.+(chegar|aparecer|mudar|atualiz)/i,
  /avisa\s+(se|quando)/i,
  /verifica\s+periodicamente/i,
];

// Regex para extrair horário da mensagem (ex: "09:24", "9h30", "às 14:00", "09:32hrs")
const TIME_REGEX = /\b(\d{1,2})[h:](\d{2})(?:h?rs?)?\b|(?:às|as|ao)\s+(\d{1,2})(?:[h:](\d{2}))?/i;

// Mapeia keywords de provedor detectados na mensagem
const PROVIDER_HINTS: Array<{ pattern: RegExp; provider: string; action: string; label: string }> = [
  { pattern: /rel[oó]gio|hor[aá]rio|hora|[aà]s\s+\d{1,2}[h:]\d{2}|[aà]s\s+\d{1,2}h\b|\d{1,2}:\d{2}|daqui|minutos?|horas?|acorde|lembr/i, provider: "clock",    action: "check_time",      label: "horario especifico" },
  { pattern: /e.?mail|gmail|inbox|caixa\s+(de\s+entrada|postal)|novo.{0,10}email/i, provider: "gmail",    action: "count_unread",    label: "emails nao lidos no Gmail" },
  { pattern: /calend[aá]rio|reuniao|reuni[oã]o|evento|compromisso/i,                provider: "calendar", action: "get_event_count",  label: "eventos no Google Calendar" },
  { pattern: /drive|arquivo|pasta|documento/i,                                      provider: "drive",    action: "list_recent",     label: "arquivos no Drive" },
  { pattern: /github|commit|pr|pull request|issue/i,                                provider: "github",   action: "list_events",     label: "atividade no GitHub" },
  { pattern: /slack|mensagem|canal/i,                                               provider: "slack",    action: "count_messages",  label: "mensagens no Slack" },
];

export interface PlannerBridgeResult {
  detected: boolean;
  created: boolean;
  watchId?: string;
  watchName?: string;
  wasDuplicate: boolean;
  existingWatchId?: string;
  message: string;
}

export interface WatchIntentDetection {
  hasIntent: boolean;
  provider?: string;
  action?: string;
  label?: string;
  condition?: ConditionTree;
}

function extractTargetTime(message: string): string | null {
  const match = TIME_REGEX.exec(message);
  if (!match) return null;
  // Grupos: (h:m) ou (às h) ou (às hm)
  const h = match[1] ?? match[3];
  const m = match[2] ?? match[4] ?? "00";
  if (!h) return null;
  return `${h.padStart(2, "0")}:${m.padStart(2, "00")}`;
}

function detectWatchIntent(message: string): WatchIntentDetection {
  const hasIntent = INTENT_PATTERNS.some((p) => p.test(message));
  if (!hasIntent) return { hasIntent: false };

  for (const hint of PROVIDER_HINTS) {
    if (hint.pattern.test(message)) {
      // Para o provider clock, extrair o horário alvo
      const params: Record<string, unknown> = {};
      if (hint.provider === "clock") {
        const targetTime = extractTargetTime(message);
        if (targetTime) params.target_time = targetTime;
      }
      const condition: ConditionTree = {
        kind: "leaf",
        provider: hint.provider,
        action: hint.action,
        params,
        result_path: "count",
        comparator: "gt",
        value: 0,
      };
      return {
        hasIntent: true,
        provider: hint.provider,
        action: hint.action,
        label: hint.provider === "clock" && params.target_time ? `aviso às ${params.target_time}` : hint.label,
        condition,
      };
    }
  }

  // Fallback genérico — monitora Gmail se nenhum provider detectado
  return {
    hasIntent: true,
    provider: "gmail",
    action: "count_unread",
    label: "novidades",
    condition: {
      kind: "leaf",
      provider: "gmail",
      action: "count_unread",
      params: {},
      result_path: "count",
      comparator: "gt",
      value: 0,
    },
  };
}

function buildWatchName(detection: WatchIntentDetection): string {
  return `Monitorar ${detection.label ?? "novidades"} — Auto WE-04`;
}

export class WatchPlannerBridgeClass {
  /**
   * Analisa a mensagem do usuário e, se contiver intenção de monitoramento,
   * cria um Watch automaticamente. Retorna resultado para o Planner incluir
   * na resposta ao usuário.
   */
  async processMessage(
    message: string,
    sessionId?: string,
    projectId?: string
  ): Promise<PlannerBridgeResult> {
    const detection = detectWatchIntent(message);

    if (!detection.hasIntent || !detection.condition) {
      return {
        detected: false,
        created: false,
        wasDuplicate: false,
        message: "",
      };
    }

    const name = buildWatchName(detection);

    // Verificar deduplicação
    const dedup = await watchDeduplicator.check(detection.condition, sessionId);
    if (dedup.isDuplicate) {
      return {
        detected: true,
        created: false,
        wasDuplicate: true,
        existingWatchId: dedup.existingWatchId,
        message: `Ja existe um Watch ativo monitorando isso: "${dedup.existingWatchName}" (similaridade ${Math.round((dedup.similarity ?? 1) * 100)}%).`,
      };
    }

    // Criar o Watch
    const intent: WatchIntent = {
      name,
      description: `Criado automaticamente a partir da mensagem: "${message.slice(0, 80)}"`,
      condition: detection.condition,
      frequency_minutes: detection.provider === "clock" ? 1 : 30,
      priority: detection.provider === "clock" ? "high" : "normal",
      on_trigger: { type: "notify_user" },
      session_id: sessionId,
      project_id: projectId,
    };

    const result = await watchRegistry.create(intent);

    if (result.ok) {
      return {
        detected: true,
        created: true,
        watchId: result.watchId,
        watchName: name,
        wasDuplicate: false,
        message: `Watch criado: "${name}". Vou monitorar ${detection.label} e te avisar quando houver novidade.`,
      };
    }

    return {
      detected: true,
      created: false,
      wasDuplicate: false,
      message: `Nao foi possivel criar o Watch automaticamente: ${result.error}`,
    };
  }

  /**
   * Versao leve — apenas detecta se a mensagem tem intencao de monitoramento.
   * Usada para routing rapido no Pipeline sem executar criacao.
   */
  hasMonitoringIntent(message: string): boolean {
    return detectWatchIntent(message).hasIntent;
  }
}

// Singleton HMR-safe
const _g = globalThis as unknown as Record<string, unknown>;
if (!_g.__WatchPlannerBridge__) {
  _g.__WatchPlannerBridge__ = new WatchPlannerBridgeClass();
}
export const watchPlannerBridge = _g.__WatchPlannerBridge__ as WatchPlannerBridgeClass;