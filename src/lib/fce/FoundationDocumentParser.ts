// Foundation Compliance Engine — Foundation Document Parser
// Foundation v1.0 · Engineering First · Sprint FKM-1
//
// Responsabilidade UNICA: interpretar documentos Markdown oficiais.
// Nao gera FoundationRules. Nao executa validacoes. Apenas extrai estrutura.

export type ElementType =
  | "principle"
  | "invariant"
  | "restriction"
  | "contract"
  | "recommendation"
  | "definition";

export interface ParsedElement {
  readonly type: ElementType;
  readonly text: string;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly sourceLocation: string; // e.g. "MV §7"
}

export interface ParsedSection {
  readonly sectionId: string;
  readonly title: string;
  readonly rawLines: readonly string[];
  readonly elements: readonly ParsedElement[];
}

export interface ParsedDocument {
  readonly docName: string;
  readonly shortId: string;
  readonly title: string;
  readonly sections: readonly ParsedSection[];
  readonly allElements: readonly ParsedElement[];
  readonly parseTimeMs: number;
  /** Counts by element type */
  readonly counts: Readonly<Record<ElementType, number>>;
}

// ── Element type classifiers (pure text analysis, no rule logic) ───────────────

const INVARIANT_KW  = ["nunca", "never", "nao pode", "nao podera", "proibido", "jamais", "constitui"];
const RESTRICTION_KW = ["nenhum", "sem ", "exceto", "limitado", "apenas atraves", "apenas por"];
const CONTRACT_KW   = ["interface", "contrato", "deve possuir", "toda requisicao", "toda resposta", "obrigatorio", "obrigatoria"];
const PRINCIPLE_KW  = ["separacao", "isolamento", "independencia", "conversa continua", "evolucao continua", "memoria permanente", "pertence ao usuario"];
const RECOM_KW      = ["recomenda", "preferencia", "pode ser", "quando possivel", "sugere"];

function classifyElement(text: string): ElementType {
  const t = text.toLowerCase();
  if (INVARIANT_KW.some(k  => t.includes(k)))  return "invariant";
  if (CONTRACT_KW.some(k   => t.includes(k)))  return "contract";
  if (RESTRICTION_KW.some(k => t.includes(k))) return "restriction";
  if (RECOM_KW.some(k      => t.includes(k)))  return "recommendation";
  if (PRINCIPLE_KW.some(k  => t.includes(k)))  return "principle";
  return "definition";
}

// ── Keywords that signal a line is worth extracting ───────────────────────────

const MEANINGFUL_KW = [
  ...INVARIANT_KW, ...RESTRICTION_KW, ...CONTRACT_KW, ...PRINCIPLE_KW, ...RECOM_KW,
  "sempre", "deve ", "devera", "toda ", "todo ", "policy engine",
  "preserva", "pertence", "permanece", "conectores", "especialistas",
];

function isMeaningful(text: string): boolean {
  const t = text.toLowerCase();
  return text.length > 15 && MEANINGFUL_KW.some(k => t.includes(k));
}

// ── Markdown section splitter ──────────────────────────────────────────────────

interface RawSection { sectionId: string; title: string; lines: string[] }

function splitSections(content: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  const headingRe  = /^#{1,4}\s+(.+)/;
  const numberedRe = /^(\d+(?:\.\d+)?)\.\s+(.+)/;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("---")) continue;

    const hm = headingRe.exec(line);
    if (hm) {
      if (current) sections.push(current);
      const headingText = hm[1].trim();
      const nm = numberedRe.exec(headingText);
      current = { sectionId: nm ? nm[1] : headingText.slice(0, 20), title: headingText, lines: [] };
      continue;
    }

    if (!current) continue;
    const nm = numberedRe.exec(line);
    if (nm) { current.lines.push(line); continue; }
    if (line.startsWith("-"))    { current.lines.push(line.slice(1).trim()); continue; }
    if (line.startsWith("**"))   { current.lines.push(line.replace(/\*\*/g, "").trim()); continue; }
    if (line.length > 15)        { current.lines.push(line); }
  }
  if (current) sections.push(current);
  return sections;
}

// ── Extract document title from first heading ─────────────────────────────────

function extractTitle(content: string): string {
  for (const line of content.split("\n")) {
    const m = /^#\s+(.+)/.exec(line.trim());
    if (m) return m[1].trim();
  }
  return "Unknown";
}

// ── Main Parser ───────────────────────────────────────────────────────────────

export class FoundationDocumentParser {
  parse(docName: string, shortId: string, content: string): ParsedDocument {
    const start = Date.now();

    if (!content || typeof content !== "string" || content.length === 0) {
      return this.empty(docName, shortId, Date.now() - start);
    }

    let rawSections: RawSection[] = [];
    try {
      rawSections = splitSections(content);
    } catch {
      return this.empty(docName, shortId, Date.now() - start);
    }

    const counts: Record<ElementType, number> = {
      principle: 0, invariant: 0, restriction: 0, contract: 0, recommendation: 0, definition: 0,
    };

    const sections: ParsedSection[] = rawSections.map(raw => {
      const elements: ParsedElement[] = [];

      const candidates = [...raw.lines];
      if (isMeaningful(raw.title)) candidates.push(raw.title);

      for (const text of candidates) {
        if (!isMeaningful(text)) continue;
        const type = classifyElement(text);
        counts[type]++;
        elements.push(Object.freeze({
          type,
          text,
          sectionId:    raw.sectionId,
          sectionTitle: raw.title,
          sourceLocation: `${shortId} §${raw.sectionId}`,
        }));
      }

      return Object.freeze({
        sectionId: raw.sectionId,
        title:     raw.title,
        rawLines:  Object.freeze([...raw.lines]),
        elements:  Object.freeze(elements),
      });
    });

    const allElements = sections.flatMap(s => [...s.elements]);

    return Object.freeze({
      docName,
      shortId,
      title:       extractTitle(content),
      sections:    Object.freeze(sections),
      allElements: Object.freeze(allElements),
      parseTimeMs: Date.now() - start,
      counts:      Object.freeze({ ...counts }),
    });
  }

  private empty(docName: string, shortId: string, parseTimeMs: number): ParsedDocument {
    const counts: Record<ElementType, number> = {
      principle: 0, invariant: 0, restriction: 0, contract: 0, recommendation: 0, definition: 0,
    };
    return Object.freeze({ docName, shortId, title: docName, sections: [], allElements: [], parseTimeMs, counts: Object.freeze(counts) });
  }
}