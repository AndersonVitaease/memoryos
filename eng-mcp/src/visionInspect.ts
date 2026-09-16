// engineering.vision.inspect V1 — HORIZONTAL VISION capability (VISION percebe, não age).
// Real multimodal perception only: REAL image(s) -> multimodal model -> visual response.
// Provider is the PROVEN Cloudflare Workers AI REST path already used by engineering.image.create
// (same run URL shape, same operator credential resolution: env CLOUDFLARE_API_TOKEN/
// CLOUDFLARE_ACCOUNT_ID with precedence over the operator-provisioned credential file).
// The token is NEVER returned, logged or echoed; image payloads are never echoed back.
// V1 model pin: @cf/llava-hf/llava-1.5-7b-hf — proven live on this account with a real PNG
// (background color, circle color and embedded text described correctly). The provider
// contract is single-image per call, so multi-image input (1..4) runs as deterministic
// sequential per-image calls with honest per-image results (partial never pretends success).
// Actions: inspect/analyze/verify/compare/locate/extract/diagnose. Spatial evidence is
// model-reported relative positioning (top/bottom/left/right/center) — no OCR or CV engine
// is implemented here. No planner, no workflow, no agent; ONE bounded loop over <=4 images.
import * as z from "zod/v4";
import { resolveGenerationCredential, type ImageCreateCredential } from "./imageCreate.ts";

export class VisionInspectError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "VisionInspectError";
  }
}

const VISION_TIMEOUT_MS = 90_000;
export const DEFAULT_VISION_MODEL = "@cf/llava-hf/llava-1.5-7b-hf";
const PROVIDER_RUN_URL = "https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}";
const MAX_RESPONSE_CHARS = 12_000;
const SPATIAL_SUFFIX = " Also describe the relative positions (top/center/bottom, left/center/right) of the main elements you mention.";

export type VisionCredential = ImageCreateCredential;
export type VisionTransport = (credential: VisionCredential, model: string, prompt: string, imageBytes: Uint8Array) => Promise<string>;

const visionImageSchema = z.object({
  name: z.string().min(1).max(200),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  base64: z.string().min(64).max(4_200_000)
}).strict();

export const visionInspectInputSchema = z.object({
  action: z.enum(["inspect", "analyze", "verify", "compare", "locate", "extract", "diagnose"]),
  images: z.array(visionImageSchema).min(1).max(4),
  prompt: z.string().min(1).max(4000).optional(),
  claims: z.array(z.string().min(1).max(500)).min(1).max(8).optional(),
  target: z.string().min(1).max(300).optional(),
  spatial: z.boolean().optional(),
  model: z.literal("@cf/llava-hf/llava-1.5-7b-hf").optional()
}).strict();

export type VisionInspectInput = z.infer<typeof visionInspectInputSchema>;

export type VisionInspectDeps = {
  credentialLoader?: () => Promise<VisionCredential | null>;
  transport?: VisionTransport;
};

function extras(input: VisionInspectInput): string {
  const extra: string[] = [];
  if (input.prompt) extra.push(`Additional instruction: ${input.prompt}`);
  if (input.spatial) extra.push(SPATIAL_SUFFIX);
  return extra.length > 0 ? ` ${extra.join(" ")}` : "";
}

function buildPrompt(action: VisionInspectInput["action"], input: VisionInspectInput): string {
  switch (action) {
    case "inspect": return `Describe what is visible in this image: main subject, objects, colors and any text.${extras(input)}`;
    case "analyze": return `Analyze this image factually: composition, color usage, layout, notable elements and visible quality issues.${extras(input)}`;
    case "verify": {
      const claims = (input.claims ?? []).map((claim, index) => `${index + 1}) ${claim}`).join(" ");
      return `Verify the following claims strictly against this image. For each claim answer TRUE, FALSE or UNCLEAR with a one-sentence reason. ${claims}${extras(input)}`;
    }
    case "compare": return `Describe this image factually so it can be compared with another image: main subject, colors, layout and any text.${extras(input)}`;
    case "locate": return `Locate the following in this image and describe its position in relative terms (top/bottom, left/right, center). If it is absent answer exactly NOT_FOUND. Target: ${input.target}${extras(input)}`;
    case "extract": return `Extract all visible text and structured elements from this image, preserving reading order. If there is none answer exactly NONE.${extras(input)}`;
    case "diagnose": return `Diagnose visual problems in this image: defects, artifacts, rendering issues, inconsistencies. List each finding with a severity (low/medium/high). If there are none answer exactly NONE.${extras(input)}`;
  }
}

function requireActionParams(input: VisionInspectInput): void {
  if (input.action === "verify" && (!input.claims || input.claims.length === 0))
    throw new VisionInspectError("INPUT_INVALID", "action verify requires claims (1..8)");
  if (input.action === "locate" && (!input.target || input.target.trim().length === 0))
    throw new VisionInspectError("INPUT_INVALID", "action locate requires target");
  if (input.action === "compare" && input.images.length < 2)
    throw new VisionInspectError("INPUT_INVALID", "action compare requires at least 2 images");
}

function decodeImage(image: VisionInspectInput["images"][number], index: number): Uint8Array {
  const bytes = Buffer.from(image.base64, "base64");
  if (bytes.length === 0) throw new VisionInspectError("IMAGE_DECODE_FAILED", `images[${index}] (${image.name}): base64 payload did not decode to any bytes`);
  return new Uint8Array(bytes);
}

// ---- proven provider path (same REST shape as image.create; single-image contract) ----
export async function callVisionProvider(credential: VisionCredential, model: string, prompt: string, imageBytes: Uint8Array): Promise<string> {
  // The provider router requires the literal @cf/... path for this model (a percent-encoded
  // %2F path answers 7000 "No route for that URI" — proven live). The model is a schema-pinned
  // literal, so only @ and / are restored after encoding; any other special char stays encoded.
  const modelPath = encodeURIComponent(model).split("%2F").join("/").split("%40").join("@");
  const url = PROVIDER_RUN_URL.replace("{account}", encodeURIComponent(credential.accountId)).replace("{model}", modelPath);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${credential.apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ image: Array.from(imageBytes), prompt, max_tokens: 600 }),
      signal: controller.signal
    });
    if (!res.ok) throw new VisionInspectError("VISION_PROVIDER_ERROR", `vision provider rejected the request (HTTP ${res.status})`);
    const body = await res.json().catch(() => null) as { result?: { description?: unknown } } | null;
    const description = body?.result?.description;
    if (typeof description !== "string" || description.trim().length === 0)
      throw new VisionInspectError("VISION_PROVIDER_ERROR", "vision provider returned no usable visual description");
    return description.slice(0, MAX_RESPONSE_CHARS);
  } catch (error) {
    if (error instanceof VisionInspectError) throw error;
    throw new VisionInspectError("VISION_FAILED", `vision provider call failed: ${error instanceof Error ? error.message : "unknown failure"}`);
  } finally {
    clearTimeout(timer);
  }
}

type PerImage = { index: number; name: string; ok: boolean; visual?: string; code?: string; message?: string };

export async function runVisionInspect(toolName: string, input: VisionInspectInput, deps: VisionInspectDeps = {}): Promise<Record<string, unknown>> {
  void toolName;
  const startedAt = Date.now();
  const model = input.model ?? DEFAULT_VISION_MODEL;
  const finish = (status: "ok" | "partial" | "error", extra: Record<string, unknown> = {}) => ({
    status,
    action: input.action,
    provider: "cloudflare-workers-ai",
    model,
    imageCount: input.images.length,
    spatialEvidence: input.spatial === true,
    durationMs: Date.now() - startedAt,
    ...extra
  });
  try {
    requireActionParams(input);
    const prompt = buildPrompt(input.action, input);
    const credential = await (deps.credentialLoader ?? resolveGenerationCredential)();
    if (!credential)
      throw new VisionInspectError("VISION_PROVIDER_UNAVAILABLE", "no vision credential available (env CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID or operator-provisioned credential file); failing closed");
    const transport = deps.transport ?? callVisionProvider;
    const perImage: PerImage[] = [];
    for (const [index, image] of input.images.entries()) {
      try {
        const bytes = decodeImage(image, index);
        const visual = await transport(credential, model, prompt, bytes);
        perImage.push({ index, name: image.name, ok: true, visual });
      } catch (error) {
        const code = error instanceof VisionInspectError ? error.code : "VISION_FAILED";
        const message = error instanceof Error ? error.message : "image inspection failed";
        perImage.push({ index, name: image.name, ok: false, code, message });
      }
    }
    const failures = perImage.filter((item) => !item.ok);
    if (failures.length === perImage.length) {
      const first = failures[0] as PerImage | undefined;
      return finish("error", { code: first?.code ?? "VISION_FAILED", message: first?.message ?? "all image inspections failed", perImage });
    }
    const visual = perImage.filter((item) => item.ok).map((item) => `image[${item.index}] (${item.name}): ${item.visual}`).join("\n");
    return finish(failures.length > 0 ? "partial" : "ok", {
      visual,
      perImage,
      ...(failures.length > 0 ? { warnings: failures.map((item) => `image ${item.index} (${item.name}) failed with ${item.code}`) } : {})
    });
  } catch (error) {
    if (error instanceof VisionInspectError) return finish("error", { code: error.code, message: error.message });
    return finish("error", { code: "VISION_FAILED", message: error instanceof Error ? error.message : "unexpected failure" });
  }
}
