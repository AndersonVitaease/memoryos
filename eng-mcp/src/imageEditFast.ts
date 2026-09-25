// engineering.image.edit — FAST-PATH layer (IMAGE-EDIT-JEV-01): deterministic
// preset catalog (pure data entries — adding a preset = adding an entry, never
// code), Jev composition route (z-ai/glm-5.3-flash via OpenRouter chat
// completions, file-only credential) and single-call batch planning.
// The direct route (14 actions, schema-strict) stays in imageEdit.ts UNTOUCHED:
// presets and Jev only emit inputs validated by the SAME strict schema —
// schema-strict remains the hard boundary. Jev composition is ADVISORY (never a
// security boundary): an invalid composition fails closed and never executes;
// provider/credential failures fail closed; no retry loop (compose once).
// Credential is FILE ONLY (mode 0600, sk-or-v1- key extracted): the value never
// reaches argv, output, logs or the audit line (hash16 only, metadata only).
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";
import * as z from "zod/v4";
import { imageEditInputSchema, runImageEdit, type ImageEditInput } from "./imageEdit.ts";

export const JEV_MODEL = "z-ai/glm-5.3-flash";
export const JEV_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const JEV_INVENTORY_VERSION = "jev-inventory-v1";
export const JEV_ADVISORY =
  "ADVISORY — Jev composition is advisory: schema-strict validation is the hard boundary and the operator approves consequences.";
const CREDENTIAL_PATH_DEFAULT = "/data/credentials/openrouter-judge";
const CREDENTIAL_EXTRACTION = /sk-or-v1-[A-Za-z0-9]{20,}/;
const JEV_TIMEOUT_DEFAULT_MS = 12_000;
const JEV_TIMEOUT_MAX_MS = 20_000;
const JEV_MAX_TOKENS = 900;
const MAX_OPERATIONS = 50;

export class ImageEditFastError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "ImageEditFastError";
  }
}

// ---- routed input schema: the direct schema with action optional + fast fields ----
// Route exclusivity (exactly one of action/preset/command; executor payload fields
// only on the direct route) is enforced in code (detectRoute) so the schema stays a
// plain strict object — same registration path as the direct schema.
export const imageEditRoutedInputSchema = imageEditInputSchema
  .partial({ action: true })
  .extend({
    preset: z.string().max(64).optional(),
    command: z.string().min(1).max(2000).optional(),
    params: z
      .record(
        z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/),
        z.union([z.string().max(500), z.number()])
      )
      .optional()
  })
  .strict();

export type ImageEditRoutedInput = z.infer<typeof imageEditRoutedInputSchema>;

// ---- preset catalog: PURE DATA entries (name/description/params/example/steps) ----
// Anti-rework principle: adding a preset = adding an entry object, never code.
// Steps are config templates: "{{param}}" exact-match substitutes the param value
// preserving its type; every expanded step is validated against the strict schema.
export type ImageEditPreset = {
  name: string;
  description: string;
  params?: Record<string, string>;
  example?: Record<string, string | number>;
  steps: ReadonlyArray<{ action: ImageEditInput["action"]; with?: Record<string, unknown> }>;
};

export const IMAGE_EDIT_PRESETS: readonly ImageEditPreset[] = [
  {
    name: "inspect",
    description: "Snapshot do documento aberto: camadas, dimensões e estado (rota determinística, zero LLM).",
    steps: [{ action: "inspect" }]
  },
  {
    name: "export-png",
    description: "Exporta o documento aberto como PNG (qualidade 95) no caminho do parâmetro path.",
    params: { path: "caminho absoluto de destino do arquivo exportado" },
    example: { path: "/tmp/export/out.png" },
    steps: [{ action: "export", with: { output: { path: "{{path}}", format: "png", quality: 95 } } }]
  },
  {
    name: "export-jpg",
    description: "Exporta o documento aberto como JPG (qualidade 92) no caminho do parâmetro path.",
    params: { path: "caminho absoluto de destino do arquivo exportado" },
    example: { path: "/tmp/export/out.jpg" },
    steps: [{ action: "export", with: { output: { path: "{{path}}", format: "jpg", quality: 92 } } }]
  },
  {
    name: "export-webp",
    description: "Exporta o documento aberto como WebP (qualidade 90) no caminho do parâmetro path.",
    params: { path: "caminho absoluto de destino do arquivo exportado" },
    example: { path: "/tmp/export/out.webp" },
    steps: [{ action: "export", with: { output: { path: "{{path}}", format: "webp", quality: 90 } } }]
  },
  {
    name: "open-doc",
    description: "Abre o documento do parâmetro path no executor Photopea.",
    params: { path: "caminho do documento (PSD/imagens) no executor local" },
    example: { path: "D:/jobs/projeto/arte.psd" },
    steps: [{ action: "document", with: { document: { op: "open", path: "{{path}}" } } }]
  },
  {
    name: "new-doc",
    description: "Cria um documento novo com as dimensões dos parâmetros width/height.",
    params: { width: "largura em px (1-20000)", height: "altura em px (1-20000)" },
    example: { width: 1920, height: 1080 },
    steps: [{ action: "document", with: { document: { op: "create", width: "{{width}}", height: "{{height}}" } } }]
  },
  {
    name: "resize-doc",
    description: "Redimensiona o documento aberto para width/height (op resize do executor).",
    params: { width: "largura alvo (1-20000)", height: "altura alvo (1-20000)" },
    example: { width: 1080, height: 1080 },
    steps: [{ action: "document", with: { document: { op: "resize", width: "{{width}}", height: "{{height}}" } } }]
  },
  {
    name: "grayscale",
    description: "Aplica preto e branco ao documento (saturação -100 via adjust).",
    steps: [{ action: "adjust", with: { operations: [{ type: "saturation", value: -100 }] } }]
  },
  {
    name: "brightness-contrast",
    description: "Aplica brilho e contraste (adjust) com os valores dos parâmetros.",
    params: { brightness: "valor de brilho (-100000..100000)", contrast: "valor de contraste (-100000..100000)" },
    example: { brightness: 10, contrast: 15 },
    steps: [{ action: "adjust", with: { operations: [{ type: "brightness", value: "{{brightness}}" }, { type: "contrast", value: "{{contrast}}" }] } }]
  },
  {
    name: "watermark-corner",
    description: "Adiciona um texto de marca d'água (compose) na posição informada.",
    params: { text: "texto da marca d'água (<=2000)", color: "cor em hex (ex.: #ffffff)", x: "posição X em px", y: "posição Y em px" },
    example: { text: "© MemoryOS", color: "#ffffff", x: 1560, y: 980 },
    steps: [{ action: "compose", with: { elements: [{ type: "text", text: "{{text}}", color: "{{color}}", fontSize: 48, position: { x: "{{x}}", y: "{{y}}" } }] } }]
  },
  {
    name: "center-layer",
    description: "Centraliza a camada alvo (transform, eixo x e y).",
    steps: [{ action: "transform", with: { operations: [{ type: "center", axis: "both" }] } }]
  },
  {
    name: "hide-layer",
    description: "Oculta a camada nomeada no parâmetro name (layers/hide).",
    params: { name: "nome da camada a ocultar (<=120)" },
    example: { name: "fundo-provisorio" },
    steps: [{ action: "layers", with: { operations: [{ type: "hide", name: "{{name}}" }] } }]
  },
  {
    name: "open-export-png",
    description: "BATCH: abre o documento do parâmetro source e exporta como PNG (q95) no parâmetro dest — 2 passos do executor numa única chamada da tool.",
    params: { source: "caminho do documento no executor local", dest: "caminho absoluto de destino do PNG" },
    example: { source: "D:/jobs/projeto/arte.psd", dest: "/tmp/export/arte.png" },
    steps: [
      { action: "document", with: { document: { op: "open", path: "{{source}}" } } },
      { action: "export", with: { output: { path: "{{dest}}", format: "png", quality: 95 } } }
    ]
  },
  // ---------------------------------------------------------------
  // PHOTOPEA-UX-01/D4 — presets de campanha de viagem (3 formatos).
  // Layout: imagem de fundo full-canvas ({{bg}} esticado exatamente para as
  // dimensões do documento — gerar a imagem de fundo com AS MESMAS dimensões
  // para não distorcer) + faixa inferior escura + headline/sub/preço/CTA.
  // Notas do engine (canvasEngine.mjs): document.create ignora o parâmetro
  // background (sempre branco) — daí a faixa em vez de fundo colorido; texto é
  // SEM quebra de linha (1 linha por texto); y do texto = TOPO do bloco
  // aparado; peso da fonte vem do sufixo do nome ("Montserrat Bold").
  // Fontes OFL instaladas no executor VPS: Montserrat (Regular/SemiBold/Bold),
  // Inter (Regular/SemiBold/Bold).
  {
    name: "campanha-feed",
    description: "PHOTOPEA-UX-01/D4: peça de campanha 1080x1080 (feed) — fundo {{bg}} full-canvas, faixa escura inferior com headline/sub/preço, botão CTA âmbar e marca no topo. Gere {{bg}} em 1080x1080; textos de 1 linha.",
    params: { bg: "caminho/URL da imagem de fundo (gerar em 1080x1080)", headline: "titulo principal (1 linha)", sub: "subtitulo (1 linha)", price: "preço (1 linha)", cta: "texto do botão CTA (curto)", brand: "marca/logotipo textual no topo", out: "caminho de destino do PNG exportado" },
    example: { bg: "/root/.hermes/images/campanha-feed-fundo.png", headline: "PUNTA DEL ESTE", sub: "7 noites com all inclusive aéreo incluso", price: "a partir de R$ 1.899", cta: "Reserve agora", brand: "VIAGENS MEMORIA", out: "/root/.hermes/images/campanha-feed.png" },
    steps: [
      { action: "document", with: { document: { op: "create", width: 1080, height: 1080 } } },
      {
        action: "compose",
        with: {
          elements: [
            { type: "image", name: "fundo", path: "{{bg}}", width: 1080, height: 1080, position: { x: 0, y: 0 } },
            { type: "shape", name: "faixa", shape: "rectangle", color: "#101828", position: { x: 0, y: 800 }, width: 1080, height: 280 },
            { type: "text", name: "marca", text: "{{brand}}", font: "Inter SemiBold", fontSize: 24, color: "#ffffff", position: { x: 60, y: 36 } },
            { type: "text", name: "titulo", text: "{{headline}}", font: "Montserrat Bold", fontSize: 54, color: "#ffffff", position: { x: 60, y: 830 } },
            { type: "text", name: "subtitulo", text: "{{sub}}", font: "Inter Regular", fontSize: 28, color: "#d0d5dd", position: { x: 60, y: 912 } },
            { type: "text", name: "preco", text: "{{price}}", font: "Montserrat Bold", fontSize: 44, color: "#ffffff", position: { x: 60, y: 958 } },
            { type: "shape", name: "botao", shape: "rectangle", color: "#f59e0b", position: { x: 700, y: 950 }, width: 320, height: 74 },
            { type: "text", name: "cta", text: "{{cta}}", font: "Montserrat Bold", fontSize: 30, color: "#101828", position: { x: 730, y: 968 } }
          ]
        }
      },
      { action: "export", with: { output: { path: "{{out}}", format: "png", overwrite: true } } }
    ]
  },
  {
    name: "campanha-story",
    description: "PHOTOPEA-UX-01/D4: peça de campanha 1080x1920 (story/vertical) — fundo {{bg}} full-canvas, faixa escura inferior com headline/sub/preço, botão CTA âmbar e marca no topo. Gere {{bg}} em 1080x1920; textos de 1 linha.",
    params: { bg: "caminho/URL da imagem de fundo (gerar em 1080x1920)", headline: "titulo principal (1 linha)", sub: "subtitulo (1 linha)", price: "preço (1 linha)", cta: "texto do botão CTA (curto)", brand: "marca/logotipo textual no topo", out: "caminho de destino do PNG exportado" },
    example: { bg: "/root/.hermes/images/campanha-story-fundo.png", headline: "PUNTA DEL ESTE", sub: "7 noites com all inclusive aéreo incluso", price: "a partir de R$ 1.899", cta: "Reserve agora", brand: "VIAGENS MEMORIA", out: "/root/.hermes/images/campanha-story.png" },
    steps: [
      { action: "document", with: { document: { op: "create", width: 1080, height: 1920 } } },
      {
        action: "compose",
        with: {
          elements: [
            { type: "image", name: "fundo", path: "{{bg}}", width: 1080, height: 1920, position: { x: 0, y: 0 } },
            { type: "shape", name: "faixa", shape: "rectangle", color: "#101828", position: { x: 0, y: 1560 }, width: 1080, height: 360 },
            { type: "text", name: "marca", text: "{{brand}}", font: "Inter SemiBold", fontSize: 26, color: "#ffffff", position: { x: 60, y: 44 } },
            { type: "text", name: "titulo", text: "{{headline}}", font: "Montserrat Bold", fontSize: 60, color: "#ffffff", position: { x: 60, y: 1600 } },
            { type: "text", name: "subtitulo", text: "{{sub}}", font: "Inter Regular", fontSize: 30, color: "#d0d5dd", position: { x: 60, y: 1700 } },
            { type: "text", name: "preco", text: "{{price}}", font: "Montserrat Bold", fontSize: 48, color: "#ffffff", position: { x: 60, y: 1762 } },
            { type: "shape", name: "botao", shape: "rectangle", color: "#f59e0b", position: { x: 60, y: 1840 }, width: 420, height: 64 },
            { type: "text", name: "cta", text: "{{cta}}", font: "Montserrat Bold", fontSize: 28, color: "#101828", position: { x: 90, y: 1854 } }
          ]
        }
      },
      { action: "export", with: { output: { path: "{{out}}", format: "png", overwrite: true } } }
    ]
  },
  {
    name: "campanha-whats",
    description: "PHOTOPEA-UX-01/D4: peça de campanha 1200x675 (WhatsApp/link) — fundo {{bg}} full-canvas, faixa escura inferior com headline/sub, preço sobre a imagem, botão CTA âmbar à direita e marca no topo. Gere {{bg}} em 1200x675; textos de 1 linha.",
    params: { bg: "caminho/URL da imagem de fundo (gerar em 1200x675)", headline: "titulo principal (1 linha)", sub: "subtitulo (1 linha)", price: "preço (1 linha, sobre a imagem)", cta: "texto do botão CTA (curto)", brand: "marca/logotipo textual no topo", out: "caminho de destino do PNG exportado" },
    example: { bg: "/root/.hermes/images/campanha-whats-fundo.png", headline: "PUNTA DEL ESTE", sub: "7 noites com all inclusive aéreo", price: "a partir de R$ 1.899", cta: "Reserve agora", brand: "VIAGENS MEMORIA", out: "/root/.hermes/images/campanha-whats.png" },
    steps: [
      { action: "document", with: { document: { op: "create", width: 1200, height: 675 } } },
      {
        action: "compose",
        with: {
          elements: [
            { type: "image", name: "fundo", path: "{{bg}}", width: 1200, height: 675, position: { x: 0, y: 0 } },
            { type: "shape", name: "faixa", shape: "rectangle", color: "#101828", position: { x: 0, y: 525 }, width: 1200, height: 150 },
            { type: "text", name: "marca", text: "{{brand}}", font: "Inter SemiBold", fontSize: 20, color: "#ffffff", position: { x: 50, y: 30 } },
            { type: "text", name: "preco", text: "{{price}}", font: "Montserrat Bold", fontSize: 32, color: "#ffffff", position: { x: 50, y: 465 } },
            { type: "text", name: "titulo", text: "{{headline}}", font: "Montserrat Bold", fontSize: 40, color: "#ffffff", position: { x: 50, y: 545 } },
            { type: "text", name: "subtitulo", text: "{{sub}}", font: "Inter Regular", fontSize: 22, color: "#d0d5dd", position: { x: 50, y: 608 } },
            { type: "shape", name: "botao", shape: "rectangle", color: "#f59e0b", position: { x: 910, y: 570 }, width: 240, height: 60 },
            { type: "text", name: "cta", text: "{{cta}}", font: "Montserrat Bold", fontSize: 24, color: "#101828", position: { x: 935, y: 585 } }
          ]
        }
      },
      { action: "export", with: { output: { path: "{{out}}", format: "png", overwrite: true } } }
    ]
  }
];

export function presetSummary(): { name: string; description: string; params: string[] }[] {
  return IMAGE_EDIT_PRESETS.map((entry) => ({
    name: entry.name,
    description: entry.description,
    params: Object.keys(entry.params ?? {})
  }));
}

// ---- param interpolation: fail-closed, type-preserving ----
const PLACEHOLDER_EXACT = /^\{\{([a-zA-Z][a-zA-Z0-9_]{0,39})\}\}$/;
const PLACEHOLDER_SCAN_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9_]{0,39})\}\}/g;

export type PresetParams = Record<string, string | number>;

function collectPlaceholders(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(PLACEHOLDER_SCAN_PATTERN)) found.add(match[1]);
    return;
  }
  if (Array.isArray(value)) { for (const item of value) collectPlaceholders(item, found); return; }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectPlaceholders(item, found);
  }
}

function interpolateValue(value: unknown, params: PresetParams): unknown {
  if (typeof value === "string") {
    const exact = value.match(PLACEHOLDER_EXACT);
    if (exact) {
      const param = params[exact[1]];
      if (param === undefined) throw new ImageEditFastError("PRESET_PARAM_MISSING", exact[1]);
      return param;
    }
    let out = value;
    for (const match of value.matchAll(PLACEHOLDER_SCAN_PATTERN)) {
      const param = params[match[1]];
      if (param === undefined) throw new ImageEditFastError("PRESET_PARAM_MISSING", match[1]);
      out = out.replaceAll(match[0], String(param));
    }
    return out;
  }
  if (Array.isArray(value)) return value.map((item) => interpolateValue(item, params));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = interpolateValue(item, params);
    return out;
  }
  return value;
}

// ---- preset expansion (all-or-nothing: every step validated before any execution) ----
export function expandPreset(name: string, params?: PresetParams): ImageEditInput[] {
  const wanted = name.trim().toLowerCase();
  const entry = IMAGE_EDIT_PRESETS.find((candidate) => candidate.name === wanted);
  if (!entry) {
    throw new ImageEditFastError(
      "PRESET_UNKNOWN",
      `preset "${wanted}" is not in the catalog (versioned data entries in src/imageEditFast.ts)`
    );
  }
  const declared = new Set(Object.keys(entry.params ?? {}));
  const provided = Object.keys(params ?? {});
  for (const key of provided) {
    if (!declared.has(key)) throw new ImageEditFastError("PRESET_PARAM_UNKNOWN", key);
  }
  const referenced = new Set<string>();
  collectPlaceholders(entry.steps, referenced);
  for (const key of referenced) {
    if (!(key in (params ?? {}))) throw new ImageEditFastError("PRESET_PARAM_MISSING", key);
  }
  const steps: ImageEditInput[] = [];
  for (const step of entry.steps) {
    const withExpanded = step.with === undefined ? undefined : interpolateValue(step.with, params ?? {});
    const direct = imageEditInputSchema.safeParse({ action: step.action, ...(withExpanded as Record<string, unknown> | undefined) });
    if (!direct.success) {
      const issues = direct.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`.slice(0, 200))
        .join("; ")
        .slice(0, 400);
      throw new ImageEditFastError("PRESET_STEP_INVALID", `preset "${entry.name}" step ${step.action} failed schema-strict validation: ${issues}`);
    }
    steps.push(direct.data as ImageEditInput);
  }
  return steps;
}

// ---- batch planning: adjacent steps with the same action and operations-only
// payloads merge into ONE executor call (schema cap 50 operations respected) ----
export function planPresetSteps(steps: ImageEditInput[]): ImageEditInput[] {
  const operationsOnly = (step: ImageEditInput): boolean =>
    Object.keys(step).every((key) => key === "action" || key === "operations");
  const merged: ImageEditInput[] = [];
  for (const step of steps) {
    const previous = merged[merged.length - 1];
    const mergeable =
      previous !== undefined &&
      previous.action === step.action &&
      operationsOnly(previous) &&
      operationsOnly(step) &&
      (previous.operations?.length ?? 0) + (step.operations?.length ?? 0) <= MAX_OPERATIONS;
    if (mergeable) {
      previous.operations = [...(previous.operations ?? []), ...(step.operations ?? [])];
    } else {
      merged.push({ ...step, operations: step.operations ? [...step.operations] : undefined });
    }
  }
  return merged;
}

// ---- Jev composition route ----
export const JEV_SYSTEM_PROMPT = `Você compõe chamadas da engineering.image.edit (executor Photopea local) a partir de um comando em linguagem natural do operador. Responda com UM objeto JSON e nada mais — sem markdown, sem comentários, sem cercas de código.

O JSON tem "action" com EXATAMENTE uma destas ações:
inspect | document | layers | transform | style | text | compose | adjust | filter | selection | place | export | undo | redo

Campos opcionais por ação:
- document: {op: "create"|"open"|"resize"|"close", width?: número, height?: número, path?: string}
- operations: array (máx 50) de objetos {type: uma de: select|add|delete|duplicate|move|move_to|reorder|group|ungroup|rename|show|hide|opacity|visible|fill|scale|rotate|resize|center|align|add_text|set_text|font|font_size|color|align_text|position|brightness|contrast|levels|hue|saturation|create|modify|clear, ...campos}
- campos de operação: name, to, text, font (strings), fontSize, value, dx, dy, x, y, width, height (números), degrees (número), axis: x|y|both, mode: left|center|right|top|middle|bottom, align: left|center|right|justify, where: front|back|above|below, index (int), visible (bool), shape: rectangle|ellipse, kind (string<=60), radius, feather (números>=0), scale (número>0), path (string)
- elements: array (máx 20) de {type: "image"|"text"|"shape"|"fill", name?, path?, text?, font?, fontSize?, color?, color2?, shape?, position?: {x, y}, scale?, width?, height?}
- selection: {bounds?: {x, y, width, height}, kind?: "rect"|"ellipse", mode?: "new"|"add"|"subtract"|"intersect", feather?, color?}
- output (ação export): {path: OBRIGATÓRIO, format: "png"|"jpg"|"jpeg"|"webp"|"psd", quality?: 1-100, maxWidth?, maxHeight?}
- target/scope: strings curtas (nome de camada / escopo document|layers|selection)

NUNCA invente campos fora deste inventário; nunca inclua preset, command ou params; nunca envie scripts, toolName, shell ou JSON-RPC. Escolha a ação mais direta para o comando; sem ações extras. Exemplos:
- "exportar como PNG em /tmp/x.png" -> {"action":"export","output":{"path":"/tmp/x.png","format":"png","quality":95}}
- "deixe em preto e branco" -> {"action":"adjust","operations":[{"type":"saturation","value":-100}]}
- "centralize a camada logo" -> {"action":"transform","target":"logo","operations":[{"type":"center","axis":"both"}]}`;

export type JevProviderMeta = {
  model: string;
  id: string | null;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
};

export type JevHttpResponse = { ok: boolean; status: number; text: () => Promise<string> };

export type ImageEditFastDeps = {
  executor?: (input: ImageEditInput) => Promise<Record<string, unknown>>;
  fetchImpl?: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal; redirect: "error" }) => Promise<JevHttpResponse>;
  readCredential?: (path: string) => string;
  auditFile?: string | null;
  now?: () => number;
};

function defaultReadCredential(path: string): string {
  const stat = statSync(path);
  if ((stat.mode & 0o077) !== 0) throw new ImageEditFastError("JEV_CREDENTIAL_MODE", "credential file must be mode 0600");
  return readFileSync(path, "utf8");
}

function credentialPath(): string {
  const raw = process.env.ENG_MCP_JEV_KEY_FILE;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : CREDENTIAL_PATH_DEFAULT;
}

function resolveJevCredential(deps: ImageEditFastDeps): { key: string; sha16: string } {
  const path = credentialPath();
  let text: string;
  try {
    text = deps.readCredential ? deps.readCredential(path) : defaultReadCredential(path);
  } catch (error) {
    if (error instanceof ImageEditFastError) throw error;
    throw new ImageEditFastError("JEJ_CREDENTIAL_MISSING", `credential file not readable at ${path}`);
  }
  const match = text.match(CREDENTIAL_EXTRACTION);
  if (!match) throw new ImageEditFastError("JEJ_CREDENTIAL_INVALID", "credential file does not contain an sk-or-v1- key");
  return { key: match[0], sha16: createHash("sha256").update(text).digest("hex").slice(0, 16) };
}

function jevTimeoutMs(): number {
  const raw = Number(process.env.ENG_MCP_JEV_TIMEOUT_MS ?? "12000");
  if (Number.isFinite(raw) && raw >= 250) return Math.min(raw, JEV_TIMEOUT_MAX_MS);
  return JEV_TIMEOUT_DEFAULT_MS;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || (error as NodeJS.ErrnoException).code === "ABORT_ERR");
}

function mapStatusToJevError(status: number, text: string): ImageEditFastError {
  const detail = text.length > 0 ? `: ${text.slice(0, 200)}` : "";
  if (status === 401) return new ImageEditFastError("JEJ_AUTH_REJECTED", `provider rejected the credential (401)${detail}`);
  if (status === 429) return new ImageEditFastError("JEJ_RATE_LIMIT", `provider rate limited the call (429)${detail}`);
  if (status === 400 || status === 404 || status === 422) return new ImageEditFastError("JEJ_PROVIDER_REJECTED", `provider rejected the request (${status})${detail}`);
  return new ImageEditFastError("JEJ_PROVIDER_ERROR", `provider returned HTTP ${status}${detail}`);
}

function parseJevContent(content: string): Record<string, unknown> {
  let cleaned = content.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  }
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch {
    throw new ImageEditFastError("JEJ_OUTPUT_INVALID", `composition is not JSON: ${cleaned.slice(0, 200)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ImageEditFastError("JEJ_OUTPUT_INVALID", "composition is not an object");
  }
  return parsed as Record<string, unknown>;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sha16(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export type JevComposition = {
  composed: ImageEditInput;
  provider: {
    model: string;
    id: string | null;
    latencyMs: number;
    promptTokens: number | null;
    completionTokens: number | null;
    cost: number | null;
  };
  commandHash16: string;
};

export async function composeWithJev(
  command: string,
  deps: Pick<ImageEditFastDeps, "fetchImpl" | "readCredential"> = {}
): Promise<JevComposition> {
  const startedAt = Date.now();
  if (command.length === 0 || command.length > 2000) {
    throw new ImageEditFastError("JEJ_INPUT_INVALID", "command must be 1-2000 chars");
  }
  const credential = resolveJevCredential(deps);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), jevTimeoutMs());
  try {
    const fetchImpl = deps.fetchImpl ?? ((url: string, init: Parameters<NonNullable<ImageEditFastDeps["fetchImpl"]>>[1]) =>
      fetch(url, init as RequestInit) as unknown as Promise<JevHttpResponse>);
    const response = await fetchImpl(JEV_CHAT_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: JEV_MODEL,
        messages: [
          { role: "system", content: JEV_SYSTEM_PROMPT },
          { role: "user", content: command }
        ],
        temperature: 0,
        max_tokens: JEV_MAX_TOKENS
      }),
      signal: controller.signal,
      redirect: "error"
    });
    const text = (await response.text()).slice(0, 20000);
    if (!response.ok) throw mapStatusToJevError(response.status, text);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text) as Record<string, unknown>; } catch {
      throw new ImageEditFastError("JEJ_OUTPUT_INVALID", "provider response is not JSON");
    }
    const choices = body.choices;
    const content = Array.isArray(choices) && choices.length > 0
      ? (choices[0] as { message?: { content?: unknown } }).message?.content
      : undefined;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new ImageEditFastError("JEJ_OUTPUT_INVALID", "provider response has no message content");
    }
    const composedRaw = parseJevContent(content);
    const validated = imageEditInputSchema.safeParse(composedRaw);
    if (!validated.success) {
      const issues = validated.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`.slice(0, 200))
        .join(" | ")
        .slice(0, 400);
      throw new ImageEditFastError("JEJ_COMPOSE_INVALID", `composition failed schema-strict validation (inventory enforced): ${issues}`);
    }
    const usage = body.usage as Record<string, unknown> | undefined;
    return {
      composed: validated.data as ImageEditInput,
      provider: {
        model: typeof body.model === "string" ? body.model : JEV_MODEL,
        id: typeof body.id === "string" ? body.id : null,
        latencyMs: Date.now() - startedAt,
        promptTokens: numberOrNull(usage?.prompt_tokens),
        completionTokens: numberOrNull(usage?.completion_tokens),
        cost: numberOrNull(usage?.cost)
      },
      commandHash16: sha16(command)
    };
  } catch (error) {
    if (error instanceof ImageEditFastError) throw error;
    if (isAbortError(error)) throw new ImageEditFastError("JEJ_TIMEOUT", "composition aborted by timeout");
    throw new ImageEditFastError("JEJ_PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timeout);
  }
}

// NOTE: composeWithJev validates the composed output against the SAME strict
// schema as every other route (imageEditInputSchema): only the 14 actions and
// the 35 operation types can EVER reach the executor, so Jev can never authorize
// actions outside the inventory.

export type ImageEditRoute = "direct" | "preset" | "jev";

type Stage = { stage: string; ms: number };

// ---- audit (metadata only: hashes + counters, never command/preset payload) ----
function writeFastAudit(auditFile: string | null | undefined, entry: Record<string, unknown>): void {
  const file = auditFile ?? process.env.ENG_MCP_IMAGE_EDIT_FAST_AUDIT_FILE ?? "/data/audit/image-edit-fast.jsonl";
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
  } catch {
    // never-fail: audit failure degrades to a marker, never fails the call
  }
}

export async function runImageEditRouted(
  input: ImageEditRoutedInput,
  deps: ImageEditFastDeps = {}
): Promise<Record<string, unknown>> {
  const now = deps.now ?? (() => Date.now());
  const executor = deps.executor ?? runImageEdit;
  const startedAt = now();
  const stages: Stage[] = [];
  const finish = (): { totalMs: number; stages: Stage[] } => ({ totalMs: Math.max(0, now() - startedAt), stages });
  const audit = (entry: Record<string, unknown>): void => writeFastAudit(deps.auditFile, { tool: "engineering.image.edit", ts: new Date().toISOString(), ...entry });

  let route: ImageEditRoute;
  try {
    route = detectRoute(input);
  } catch (error) {
    const fastError = error instanceof ImageEditFastError
      ? error
      : new ImageEditFastError("FAST_ROUTE_INVALID", error instanceof Error ? error.message : String(error));
    audit({ route: "conflict", name: "-", ok: false, code: fastError.code, totalMs: 0, stages: 0 });
    return {
      status: "error", route: "conflict", code: fastError.code, message: fastError.message,
      ...(fastError.code === "PRESET_UNKNOWN" ? { available: presetSummary() } : {}),
      advisory: JEV_ADVISORY
    };
  }
  const since = now();
  stages.push({ stage: "route", ms: Math.max(0, now() - since) });

  if (route === "direct") {
    const stepSince = now();
    const result = await executor(input as ImageEditInput);
    stages.push({ stage: "executor", ms: Math.max(0, now() - stepSince) });
    audit({
      route, name: input.action ?? "-", ok: result.status === "ok",
      ...(result.status !== "ok" ? { code: String(result.code ?? "EXECUTOR_ERROR") } : {}),
      totalMs: finish().totalMs, stages: stages.length
    });
    // Additive only: the direct result keeps its shape plus `route` and `timing`.
    return { ...result, route, timing: finish() };
  }

  if (route === "preset") {
    const presetName = String(input.preset ?? "").trim().toLowerCase();
    try {
      let expandSince = now();
      const steps = expandPreset(presetName, input.params);
      stages.push({ stage: "expand", ms: Math.max(0, now() - expandSince) });
      const planSince = now();
      const plan = planPresetSteps(steps);
      stages.push({ stage: "plan", ms: Math.max(0, now() - planSince) });
      const stepResults: Record<string, unknown>[] = [];
      let completed = 0;
      let status: "ok" | "error" | "partial" = "ok";
      for (const step of plan) {
        const stepSince = now();
        const result = await executor(step);
        const ok = result.status === "ok";
        stepResults.push({
          action: step.action,
          status: result.status,
          ...(ok ? {} : { code: result.code, message: result.message }),
          ms: Math.max(0, now() - stepSince)
        });
        if (ok) completed += 1;
        else { status = completed > 0 ? "partial" : "error"; break; }
      }
      audit({
        route, name: presetName, ok: status === "ok",
        ...(status !== "ok" ? { code: "PRESET_STEP_FAILED" } : {}),
        totalMs: finish().totalMs, stages: stages.length
      });
      return {
        status, route, preset: presetName, completed, steps: stepResults,
        ...(status !== "ok" ? { advisory: JEV_ADVISORY } : {}),
        timing: finish()
      };
    } catch (error) {
      const fastError = error instanceof ImageEditFastError
        ? error
        : new ImageEditFastError("PRESET_EXPAND_FAILED", error instanceof Error ? error.message : String(error));
      audit({ route, name: presetName, ok: false, code: fastError.code, totalMs: finish().totalMs, stages: stages.length });
      return {
        status: "error", route, preset: presetName, code: fastError.code, message: fastError.message,
        ...(fastError.code === "PRESET_UNKNOWN" ? { available: presetSummary() } : {}),
        timing: finish()
      };
    }
  }

  // route === "jev"
  const command = String(input.command ?? "");
  const commandHash16 = sha16(command);
  const composeSince = now();
  let composition: JevComposition;
  try {
    composition = await composeWithJev(command, { fetchImpl: deps.fetchImpl, readCredential: deps.readCredential });
  } catch (error) {
    const fastError = error instanceof ImageEditFastError
      ? error
      : new ImageEditFastError("JEJ_UNEXPECTED", error instanceof Error ? error.message : String(error));
    audit({
      route, name: "jev", ok: false, code: fastError.code,
      totalMs: finish().totalMs, stages: stages.length, commandHash16
    });
    return {
      status: "error", route, code: fastError.code, message: fastError.message, commandHash16,
      provider: { model: JEV_MODEL, latencyMs: Math.max(0, now() - composeSince) },
      timing: finish(),
      advisory: JEV_ADVISORY
    };
  }
  stages.push({ stage: "jev-compose", ms: composition.provider.latencyMs });
  const executorSince = now();
  const result = await executor(composition.composed);
  stages.push({ stage: "executor", ms: Math.max(0, now() - executorSince) });
  audit({
    route, name: composition.composed.action, ok: result.status === "ok",
    ...(result.status !== "ok" ? { code: String(result.code ?? "EXECUTOR_ERROR") } : {}),
    totalMs: finish().totalMs, stages: stages.length, commandHash16
  });
  return {
    status: result.status, route, commandHash16,
    composed: composition.composed,
    jev: {
      model: composition.provider.model, id: composition.provider.id,
      latencyMs: composition.provider.latencyMs,
      promptTokens: composition.provider.promptTokens,
      completionTokens: composition.provider.completionTokens,
      cost: composition.provider.cost,
      inventoryVersion: JEV_INVENTORY_VERSION
    },
    result,
    timing: finish(),
    advisory: JEV_ADVISORY
  };
}

function detectRoute(input: ImageEditRoutedInput): ImageEditRoute {
  const hasAction = input.action !== undefined;
  const hasPreset = input.preset !== undefined;
  const hasCommand = input.command !== undefined;
  const routeCount = [hasAction, hasPreset, hasCommand].filter(Boolean).length;
  if (routeCount === 0) throw new ImageEditFastError("FAST_ROUTE_MISSING", "exactly one of action/preset/command is required");
  if (routeCount > 1) {
    throw new ImageEditFastError("FAST_ROUTE_CONFLICT", "action, preset and command are mutually exclusive routes");
  }
  if (hasPreset || hasCommand) {
    for (const key of ["target", "scope", "document", "operations", "elements", "selection", "output"] as const) {
      if (input[key] !== undefined) {
        throw new ImageEditFastError(
          "FAST_ROUTE_FIELDS",
          `executor payload field "${key}" is only valid on the direct action route`
        );
      }
    }
  }
  return hasAction ? "direct" : hasPreset ? "preset" : "jev";
}