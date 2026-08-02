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
  // Padrões de envio agendado: "às HH:MM envie/mande/envia..." / "as HH:MMhrs envie..."
  /[àa]s\s+\d{1,2}[h:]\d{2}/i,
  /\d{1,2}[h:]\d{2}h?r?s?\s+(envie?|mande?|envia|manda|dispare?)/i,
  /\d{1,2}[h:]\d{2}hrs?\b/i,
  /(envie?|mande?|envia|manda)\s+.{0,40}(e.?mail|mensagem)/i,
  /as\s+\d{1,2}[h:]\d{2}/i,
];

// Regex para extrair horário — cobre: "15:22", "15:22hrs", "15h22", "às 15:22", "15:22h", "15:54hrs"
const TIME_REGEX = /(?:[àa]s?\s*)(\d{1,2})[h:](\d{2})(?:hrs?)?|(\d{1,2})[h:](\d{2})(?:hrs?)\b|(?:[àa]s?\s*)(\d{1,2})h\b|(\d{1,2})[h:](\d{2})\b|(\d{1,2})h(\d{2})\b/i;

// Regex para extrair dados de email da mensagem
// Captura formatos: "Para: email", "Para : email", "para email@..." etc.
const EMAIL_TO_REGEX = /(?:para|to)\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i;
const EMAIL_FROM_REGEX = /(?:de|from)\s*:?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i;
const EMAIL_SUBJECT_REGEX = /(?:assunto|subject)\s*:?\s*(.+)/i;

interface EmailPayload {
  to: string;
  from?: string;
  subject: string;
  body: string;
}

function extractEmailPayload(message: string): EmailPayload | null {
  const toMatch = EMAIL_TO_REGEX.exec(message);
  const fromMatch = EMAIL_FROM_REGEX.exec(message);
  const subjectMatch = EMAIL_SUBJECT_REGEX.exec(message);
  if (!toMatch || !subjectMatch) return null;

  // Extrai o corpo: tudo após a linha do assunto até o final
  const subjectIdx = message.toLowerCase().search(/(?:assunto|subject)\s*:?/i);
  const bodyStart = message.indexOf("\n", subjectIdx);
  const body = bodyStart >= 0 ? message.slice(bodyStart).trim() : "";

  return {
    to: toMatch[1].trim(),
    from: fromMatch?.[1]?.trim(),
    subject: subjectMatch[1].trim().split("\n")[0].trim(), // só primeira linha
    body: body || subjectMatch[1].trim(),
  };
}

// Mapeia keywords de provedor detectados na mensagem
// IMPORTANTE: clock deve vir primeiro — mensagens com horário + email devem
// ser tratadas como clock (envio agendado), não como monitoramento de Gmail.
const PROVIDER_HINTS: Array<{ pattern: RegExp; provider: string; action: string; label: string }> = [
  { pattern: /[àa]s\s+\d{1,2}[h:]\d{2}|as\s+\d{1,2}[h:]\d{2}|rel[oó]gio|hor[aá]rio|\d{1,2}[h:]\d{2}h?r?s?|daqui\s+\d|minutos?\s+envi|acorde|lembr[ae]/i, provider: "clock",    action: "check_time",      label: "horario especifico" },
  { pattern: /calend[aá]rio|reuniao|reuni[oã]o|evento|compromisso/i,                provider: "calendar", action: "get_event_count",  label: "eventos no Google Calendar" },
  { pattern: /drive|arquivo|pasta|documento/i,                                      provider: "drive",    action: "list_recent",     label: "arquivos no Drive" },
  { pattern: /github|commit|pr|pull request|issue/i,                                provider: "github",   action: "list_events",     label: "atividade no GitHub" },
  { pattern: /slack|mensagem|canal/i,                                               provider: "slack",    action: "count_messages",  label: "mensagens no Slack" },
  { pattern: /e.?mail|gmail|inbox|caixa\s+(de\s+entrada|postal)|novo.{0,10}email/i, provider: "gmail",    action: "count_unread",    label: "emails nao lidos no Gmail" },
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
  // Grupos: 1,2 = àsH:M(hrs) | 3,4 = H:M(hrs) | 5 = àsH | 6,7 = H:M | 8,9 = HhMM
  const h = match[1] ?? match[3] ?? match[5] ?? match[6] ?? match[8];
  const m = match[2] ?? match[4] ?? match[7] ?? match[9] ?? "00";
  if (!h) return null;
  const hNum = parseInt(h, 10);
  const mNum = parseInt(m, 10);
  if (isNaN(hNum) || hNum > 23 || mNum > 59) return null;
  return `${String(hNum).padStart(2, "0")}:${String(mNum).padStart(2, "0")}`;
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
   *
   * historyMessages: array de { role, content } para buscar email em mensagens anteriores.
   */
  async processMessage(
    message: string,
    sessionId?: string,
    projectId?: string,
    historyMessages?: Array<{ role: string; content: string }>
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

    // Detectar email: primeiro tenta na mensagem atual, depois varre o histórico
    // (cobre caso onde o usuário deu os dados em mensagens anteriores)
    let emailPayload = extractEmailPayload(message);
    if (!emailPayload && historyMessages?.length) {
      const recentHistory = historyMessages.slice(-10);
      const combined = recentHistory.map(m => m.content).join("\n");
      emailPayload = extractEmailPayload(combined);
    }
    const hasEmail = Boolean(emailPayload);

    const watchLabel = hasEmail && detection.provider === "clock"
      ? `${name} + email para ${emailPayload!.to}`
      : name;

    // Criar o Watch
    const intent: WatchIntent = {
      name: watchLabel,
      description: `Criado automaticamente a partir da mensagem: "${message.slice(0, 80)}"`,
      condition: detection.condition,
      frequency_minutes: detection.provider === "clock" ? 1 : 30,
      priority: detection.provider === "clock" ? "high" : "normal",
      on_trigger: hasEmail
        ? { type: "emit_event", payload: { type: "send_email", email: emailPayload } }
        : { type: "notify_user" },
      session_id: sessionId,
      project_id: projectId,
    };

    const result = await watchRegistry.create(intent);

    if (result.ok) {
      const targetTime = (detection.condition as any).params?.target_time;
      const confirmMsg = hasEmail
        ? `Alerta criado${targetTime ? ` para às ${targetTime}` : ""}. Vou enviar email para ${emailPayload!.to} quando o horário chegar.`
        : `Watch criado: "${name}". Vou monitorar ${detection.label} e te avisar quando houver novidade.`;
      return {
        detected: true,
        created: true,
        watchId: result.watchId,
        watchName: watchLabel,
        wasDuplicate: false,
        message: confirmMsg,
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

// Sempre recria para garantir que o código mais recente seja usado
const _g = globalThis as unknown as Record<string, unknown>;
_g.__WatchPlannerBridge__ = new WatchPlannerBridgeClass();
export const watchPlannerBridge = _g.__WatchPlannerBridge__ as WatchPlannerBridgeClass;