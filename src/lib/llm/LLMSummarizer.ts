/**
 * LLMSummarizer.ts — Sprint read-03
 *
 * Abstração simples para resumir texto usando LLM.
 *
 * v1.0: suporta padrão Mock (demo) e placeholder para OpenAI/Claude.
 *       Futuro: suportar múltiplos providers (OpenAI, Claude, local LLMs).
 *
 * SRP: orquestrar chamada a LLM e retornar resumo estruturado.
 */

export interface LLMSummarizationRequest {
  readonly text: string;
  readonly maxTokens?: number;
  readonly style?: "bullet-points" | "paragraph" | "executive";
  readonly language?: string;
}

export interface LLMSummarizationResult {
  readonly success: boolean;
  readonly summary?: string;
  readonly error?: string;
  readonly tokens?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
  };
  readonly model?: string;
  readonly durationMs?: number;
}

/**
 * LLMSummarizer — encapsula a lógica de resumo.
 * Inicialmente com mock; depois integra OpenAI/Claude.
 */
class LLMSummarizerClass {
  /**
   * Sumariza texto usando LLM.
   * v1.0: versão mock (retorna resumo simulado).
   * Future: integração com OpenAI API.
   */
  async summarize(req: LLMSummarizationRequest): Promise<LLMSummarizationResult> {
    const t0 = Date.now();

    // ── Validação ────────────────────────────────────────────────────────────

    if (!req.text || typeof req.text !== "string") {
      return {
        success: false,
        error: "Text is required and must be a string",
      };
    }

    const textLength = req.text.length;
    if (textLength < 100) {
      return {
        success: false,
        error: "Text must be at least 100 characters",
      };
    }

    // ── Configuração ─────────────────────────────────────────────────────────

    const maxTokens = req.maxTokens ?? 500;
    const style = req.style ?? "bullet-points";
    const language = req.language ?? "pt-BR";

    // ── v1.0: Mock Implementation ────────────────────────────────────────────
    // Em produção, isso chamaria OpenAI/Claude API.
    // Para agora, geramos resumo simulado baseado em heurística.

    const summary = this._mockSummarize(req.text, style, maxTokens);

    const durationMs = Date.now() - t0;

    return {
      success: true,
      summary,
      model: "mock-v1.0",
      tokens: {
        input: Math.ceil(textLength / 4), // Aproximação: 1 token ≈ 4 chars
        output: Math.ceil(summary.length / 4),
        total: Math.ceil((textLength + summary.length) / 4),
      },
      durationMs,
    };
  }

  /**
   * Gerador de resumo mock para demonstração.
   * Extrai os primeiros parágrafos e principais pontos.
   */
  private _mockSummarize(
    text: string,
    style: "bullet-points" | "paragraph" | "executive",
    maxTokens: number,
  ): string {
    // Normaliza e limpa o texto
    const lines = text
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return "No content to summarize.";

    // Extrai parágrafos
    const paragraphs = lines.join(" ").split(/\. /);

    switch (style) {
      case "bullet-points": {
        // Retorna pontos principais
        const points = paragraphs.slice(0, Math.ceil(maxTokens / 50)).map((p) => {
          const trimmed = p.trim();
          return trimmed.length > 0 ? `• ${trimmed.substring(0, 150)}...` : null;
        });
        return points.filter((p) => p !== null).join("\n");
      }

      case "paragraph": {
        // Retorna resumo em parágrafo
        const selectedParagraphs = paragraphs
          .slice(0, Math.ceil(maxTokens / 100))
          .join(". ");
        return selectedParagraphs.substring(0, maxTokens * 4) + ".";
      }

      case "executive": {
        // Resumo executivo muito curto
        const summary = paragraphs[0] || "No executive summary available.";
        return summary.substring(0, Math.min(300, maxTokens * 4)) + ".";
      }

      default:
        return "Summarization style not supported.";
    }
  }
}

// ── Singleton instance ───────────────────────────────────────────────────────

export const LLMSummarizer = new LLMSummarizerClass();
