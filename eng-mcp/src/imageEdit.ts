// engineering.image.edit V2 — ONE supertool over the user's LOCAL Photopea executor.
// Transport: minimal authenticated outbound-only WSS relay (RFC6455 framing implemented
// here; zero new dependencies). The executor (Windows) connects OUT to this hub with a
// dedicated token (sha256 at rest in credentials/image-relay.token). Callers may send
// ONLY the strict structured schema below — never toolName/JSON-RPC/script/shell.
// Fail-closed: offline/timeout/invalid response/disconnect never invent success.
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";
import * as z from "zod/v4";

export const RELAY_PATH = "/relay";
const MAX_FRAME_BYTES = 1_000_000;
const DEFAULT_CALL_TIMEOUT_MS = 150_000;
const EXPORT_CALL_TIMEOUT_MS = 240_000;

type WsLike = { send: (data: string) => void; close: (code?: number) => void };
type Session = { ws: WsLike; connectedAt: number };
let session: Session | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
let relayEnabled = false;
let tokenHash: string | null = null;
let lastRelayError: string | null = null;

function tokenFilePath(): string {
  return process.env.ENG_MCP_IMAGE_RELAY_TOKEN_FILE
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "imageEdit.token.json");
}

// ---- minimal RFC6455 server framing (text frames only; client frames are masked) ----
function wsAccept(key: string): string {
  return createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
}
function encodeText(payload: string): Buffer {
  const body = Buffer.from(payload, "utf8");
  const len = body.length;
  let header: Buffer;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, body]);
}
function parseFrames(buf: Buffer): { frames: { opcode: number; payload: Buffer }[]; rest: Buffer } {
  const frames: { opcode: number; payload: Buffer }[] = []; let off = 0;
  while (buf.length - off >= 2) {
    const b0 = buf[off], b1 = buf[off + 1];
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, hlen = 2;
    if (len === 126) { if (buf.length - off < 4) break; len = buf.readUInt16BE(off + 2); hlen = 4; }
    else if (len === 127) { if (buf.length - off < 10) break; len = Number(buf.readBigUInt64BE(off + 2)); hlen = 10; }
    if (len > MAX_FRAME_BYTES) { frames.push({ opcode: 0x8, payload: Buffer.alloc(0) }); return { frames, rest: Buffer.alloc(0) }; }
    const mlen = masked ? 4 : 0;
    if (buf.length - off < hlen + mlen + len) break;
    let payload = buf.subarray(off + hlen + mlen, off + hlen + mlen + len);
    if (masked) { const mask = buf.subarray(off + hlen, off + hlen + 4); const out = Buffer.allocUnsafe(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
    frames.push({ opcode: b0 & 0x0f, payload });
    off += hlen + mlen + len;
  }
  return { frames, rest: buf.subarray(off) };
}

function failPending(code: string): void {
  for (const [id, p] of pending) { clearTimeout(p.timer); pending.delete(id); p.reject(new Error(code)); }
}

export function attachImageRelay(server: Server): void {
  void (async () => {
    try {
      const text = (await readFile(tokenFilePath(), "utf8")).trim();
      let raw = text;
      try { const parsed = JSON.parse(text) as { tokenHash?: unknown }; if (typeof parsed.tokenHash === "string") raw = parsed.tokenHash; } catch { /* bare hex token-hash file */ }
      raw = raw.trim().toLowerCase();
      if (/^[a-f0-9]{64}$/.test(raw)) { tokenHash = raw; relayEnabled = true; }
    } catch { relayEnabled = false; }
    console.log(`ENG-MCP image relay enabled=${relayEnabled} path=${RELAY_PATH}`);
  })();
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== RELAY_PATH) { socket.destroy(); return; }
    const deny = (code: number, reason: string) => { try { socket.end(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`); } catch { } socket.destroy(); };
    if (!relayEnabled || !tokenHash) { lastRelayError = "relay disabled"; return deny(503, "Relay Disabled"); }
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string" || key.length < 8) return deny(400, "Bad Request");
    const proto = String(req.headers["sec-websocket-protocol"] ?? "").split(",")[0].trim().toLowerCase();
    const bearer = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim().toLowerCase();
    const presented = proto.length === 64 ? proto : bearer;
    const authOk = /^[a-f0-9]{64}$/.test(presented) && timingSafeEqual(Buffer.from(createHash("sha256").update(presented).digest("hex")), Buffer.from(tokenHash));
    if (!authOk) { lastRelayError = "auth rejected"; return deny(401, "Unauthorized"); }
    try {
      const upgradeHeaders = `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${wsAccept(key)}\r\n` + (proto.length === 64 ? `Sec-WebSocket-Protocol: ${proto}\r\n` : "") + "\r\n";
      socket.write(upgradeHeaders);
    } catch { return; }
    socket.setNoDelay(true);
    let buf = Buffer.alloc(0);
    const ws: WsLike = {
      send: (data: string) => { try { socket.write(encodeText(data)); } catch { /* closing */ } },
      close: (code = 1000) => { try { const b = Buffer.alloc(2); b.writeUInt16BE(code); socket.write(Buffer.concat([Buffer.from([0x88, 2]), b])); } catch { } socket.end(); }
    };
    session = { ws, connectedAt: Date.now() };
    lastRelayError = null;
    ws.send(JSON.stringify({ type: "session", ok: true, protocol: "engineering.image.edit/1" }));
    socket.on("data", (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const { frames, rest } = parseFrames(buf); buf = rest;
      for (const f of frames) {
        if (f.opcode === 0x9) { try { socket.write(Buffer.concat([Buffer.from([0x8a, Math.min(f.payload.length, 125)]), f.payload.subarray(0, 125)])); } catch { } continue; }
        if (f.opcode === 0x8) { drop(); socket.end(); return; }
        if (f.opcode !== 0x1) continue;
        let msg: Record<string, unknown>;
        try { msg = JSON.parse(f.payload.toString("utf8")) as Record<string, unknown>; } catch { drop(); ws.close(1003); return; }
        const id = typeof msg.id === "string" ? msg.id : null;
        if (msg.type === "result" && id && pending.has(id)) {
          const p = pending.get(id)!; pending.delete(id); clearTimeout(p.timer); p.resolve(msg);
        }
      }
    });
    const drop = () => { if (session) { session = null; failPending("RELAY_DISCONNECTED"); } };
    socket.on("close", drop);
    socket.on("error", drop);
  });
}

export function relayStatus(): Record<string, unknown> {
  return { enabled: relayEnabled, sessionConnected: Boolean(session), connectedAt: session?.connectedAt ?? null, lastError: lastRelayError };
}

export async function sendToExecutor(payload: Record<string, unknown>, timeoutMs = DEFAULT_CALL_TIMEOUT_MS): Promise<Record<string, unknown>> {
  if (!relayEnabled) throw new Error("LOCAL_RELAY_DISABLED");
  if (!session) throw new Error("LOCAL_EDITOR_OFFLINE");
  const id = randomUUID();
  let resolveP: (v: unknown) => void = () => { };
  let rejectP: (e: Error) => void = () => { };
  const promise = new Promise((resolve, reject) => { resolveP = resolve; rejectP = reject; });
  const timer = setTimeout(() => { pending.delete(id); rejectP(new Error("RELAY_TIMEOUT")); }, timeoutMs);
  pending.set(id, { resolve: resolveP, reject: rejectP, timer });
  try { session.ws.send(JSON.stringify({ type: "request", id, payload })); }
  catch { clearTimeout(timer); pending.delete(id); session = null; throw new Error("LOCAL_EDITOR_OFFLINE"); }
  try {
    const msg = await promise as Record<string, unknown>;
    if (typeof msg.ok !== "boolean") throw new Error("RELAY_INVALID_RESPONSE");
    return msg;
  } finally { clearTimeout(timer); pending.delete(id); }
}

const FAIL_HINTS: Record<string, string> = {
  LOCAL_RELAY_DISABLED: "relay credential file missing/invalid on server; relay refuses to start (fail-closed)",
  LOCAL_EDITOR_OFFLINE: "local executor not connected; no VPS fallback is attempted (fail-closed)",
  RELAY_TIMEOUT: "executor did not answer within the time budget; no success is claimed",
  RELAY_INVALID_RESPONSE: "executor response did not match the relay protocol",
  RELAY_DISCONNECTED: "executor connection dropped while the request was pending"
};

// ---- strict structured schema: composed operations, no raw execution anywhere ----
const num = (min: number, max: number) => z.number().min(min).max(max);
const op = z.object({
  type: z.enum(["select", "add", "delete", "duplicate", "move", "move_to", "reorder", "group", "ungroup", "rename", "show", "hide", "opacity", "visible", "fill", "scale", "rotate", "resize", "center", "align", "add_text", "set_text", "font", "font_size", "color", "align_text", "position", "brightness", "contrast", "levels", "hue", "saturation", "create", "modify", "clear"]),
  name: z.string().max(120).optional(),
  to: z.string().max(120).optional(),
  text: z.string().max(2000).optional(),
  font: z.string().max(120).optional(),
  fontSize: num(1, 2000).optional(),
  color: z.string().max(32).optional(),
  color2: z.string().max(32).optional(),
  value: num(-100000, 100000).optional(),
  percent: num(1, 1000).optional(),
  dx: num(-20000, 20000).optional(), dy: num(-20000, 20000).optional(),
  x: num(-20000, 20000).optional(), y: num(-20000, 20000).optional(),
  width: num(1, 20000).optional(), height: num(1, 20000).optional(),
  degrees: num(-360, 360).optional(),
  axis: z.enum(["x", "y", "both"]).optional(),
  mode: z.enum(["left", "center", "right", "top", "middle", "bottom"]).optional(),
  align: z.enum(["left", "center", "right", "justify"]).optional(),
  where: z.enum(["front", "back", "above", "below"]).optional(),
  index: z.number().int().min(-100).max(500).optional(),
  visible: z.boolean().optional(),
  shape: z.enum(["rectangle", "ellipse"]).optional(),
  kind: z.string().max(60).optional(),
  radius: num(0, 1000).optional(),
  feather: num(0, 1000).optional(),
  scale: num(0.01, 50).optional(),
  path: z.string().max(500).optional()
}).strict();

const element = z.object({
  type: z.enum(["image", "text", "shape", "fill"]),
  name: z.string().max(120).optional(),
  path: z.string().max(500).optional(),
  text: z.string().max(2000).optional(),
  font: z.string().max(120).optional(),
  fontSize: num(1, 2000).optional(),
  color: z.string().max(32).optional(),
  color2: z.string().max(32).optional(),
  shape: z.enum(["rectangle", "ellipse"]).optional(),
  position: z.object({ x: num(-20000, 20000), y: num(-20000, 20000) }).strict().optional(),
  scale: num(0.01, 50).optional(),
  width: num(1, 20000).optional(),
  height: num(1, 20000).optional()
}).strict();

export const imageEditInputSchema = z.object({
  action: z.enum(["inspect", "document", "layers", "transform", "style", "text", "compose", "adjust", "filter", "selection", "place", "export", "undo", "redo"]),
  target: z.string().max(120).optional(),
  scope: z.enum(["document", "layers", "selection"]).optional(),
  document: z.object({ op: z.enum(["create", "open", "resize", "close"]), width: num(1, 20000).optional(), height: num(1, 20000).optional(), path: z.string().max(500).optional() }).strict().optional(),
  operations: z.array(op).max(50).optional(),
  elements: z.array(element).max(20).optional(),
  selection: z.object({ bounds: z.object({ x: num(-20000, 20000), y: num(-20000, 20000), width: num(1, 20000), height: num(1, 20000) }).strict().optional(), kind: z.enum(["rect", "ellipse"]).optional(), mode: z.enum(["new", "add", "subtract", "intersect"]).optional(), feather: num(0, 1000).optional(), color: z.string().max(32).optional() }).strict().optional(),
  output: z.object({ path: z.string().max(500), format: z.enum(["png", "jpg", "jpeg", "webp", "psd"]), quality: z.number().int().min(1).max(100).optional(), maxWidth: num(1, 20000).optional(), maxHeight: num(1, 20000).optional(), overwrite: z.literal(true).optional() }).strict().optional()
}).strict();

export type ImageEditInput = z.infer<typeof imageEditInputSchema>;

export async function runImageEdit(input: ImageEditInput): Promise<Record<string, unknown>> {
  const timeoutMs = input.action === "export" ? EXPORT_CALL_TIMEOUT_MS : DEFAULT_CALL_TIMEOUT_MS;
  const payload: Record<string, unknown> = { action: input.action };
  for (const key of ["target", "scope", "document", "operations", "elements", "selection", "output"] as const) {
    if (input[key] !== undefined) payload[key] = input[key];
  }
  try {
    const msg = await sendToExecutor(payload, timeoutMs);
    if (msg.ok === true) {
      const result = (msg.result ?? {}) as Record<string, unknown>;
      return { status: "ok", action: input.action, ...result };
    }
    const err = (msg.error ?? {}) as { code?: string; message?: string };
    return { status: "error", action: input.action, code: err.code ?? "EXECUTOR_ERROR", message: err.message ?? "executor rejected the request", relay: relayStatus() };
  } catch (error) {
    const code = error instanceof Error ? error.message : "RELAY_ERROR";
    return { status: "error", action: input.action, code, message: FAIL_HINTS[code] ?? "relay failure (fail-closed)", relay: relayStatus() };
  }
}
