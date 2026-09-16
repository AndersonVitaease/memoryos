// engineering.image.edit relay tests (T1,T2,T13,T14,T15) — loopback proof of the
// authenticated outbound-only relay: token auth before any execution, strict schema
// rejection of raw execution keys, LOCAL_EDITOR_OFFLINE when no executor is connected,
// and RELAY_TIMEOUT without invented success. No Photopea required.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { attachImageRelay, imageEditInputSchema, relayStatus, runImageEdit, sendToExecutor } from "../src/imageEdit.ts";

const RAW = randomBytes(32).toString("hex");
const WRONG = randomBytes(32).toString("hex");
let server: ReturnType<typeof createServer>;
let port = 0;
let closeUrl = "";

function connect(token: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}/relay`, [token]);
}
function firstMessage(ws: WebSocket, ms = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("first message timeout")), ms);
    ws.addEventListener("message", (ev) => { clearTimeout(t); resolve(JSON.parse(String(ev.data))); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(t); reject(new Error("socket error")); }, { once: true });
  });
}
const closed = (ws: WebSocket, ms = 2000) => new Promise<void>((resolve) => {
  const t = setTimeout(() => resolve(), ms);
  ws.addEventListener("close", () => { clearTimeout(t); resolve(); }, { once: true });
  ws.addEventListener("error", () => { clearTimeout(t); resolve(); }, { once: true });
});

before(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "eng-image-relay-"));
  const tokenFile = path.join(dir, "relay.token");
  await writeFile(tokenFile, createHash("sha256").update(RAW).digest("hex") + "\n", "utf8");
  process.env.ENG_MCP_IMAGE_RELAY_TOKEN_FILE = tokenFile;
  server = createServer(() => { });
  attachImageRelay(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
  closeUrl = `ws://127.0.0.1:${port}/relay`;
  await new Promise((r) => setTimeout(r, 250));
});
after(() => { void server.close(); });

test("T1 relay authenticates the executor and registers the session", async () => {
  const ws = connect(RAW);
  const hello = await firstMessage(ws);
  assert.equal(hello.type, "session");
  assert.equal(hello.ok, true);
  assert.equal(relayStatus().sessionConnected, true);
  ws.close();
  await closed(ws);
});

test("T2 invalid token is rejected before any session/execution", async () => {
  const ws = connect(WRONG);
  await closed(ws);
  assert.equal(relayStatus().sessionConnected, false);
  assert.equal(relayStatus().lastError, "auth rejected");
});

test("T13 strict schema rejects raw execution keys (script/toolName/shell/jsonrpc)", () => {
  assert.equal(imageEditInputSchema.safeParse({ action: "inspect", script: "app.documents.add()" }).success, false);
  assert.equal(imageEditInputSchema.safeParse({ action: "inspect", toolName: "photopea_run_script" }).success, false);
  assert.equal(imageEditInputSchema.safeParse({ action: "inspect", shell: "powershell ..." }).success, false);
  assert.equal(imageEditInputSchema.safeParse({ action: "inspect", jsonrpc: "2.0", method: "tools/call" }).success, false);
  assert.equal(imageEditInputSchema.safeParse({ action: "nonsense" }).success, false);
  assert.equal(imageEditInputSchema.safeParse({ action: "transform", target: "X", operations: [{ type: "scale", percent: 115 }] }).success, true);
});

test("T14 no executor connected returns LOCAL_EDITOR_OFFLINE (fail-closed, no VPS fallback)", async () => {
  const result = await runImageEdit({ action: "inspect" });
  assert.equal(result.status, "error");
  assert.equal(result.code, "LOCAL_EDITOR_OFFLINE");
});

test("T15 timeout never invents success (executor connected but silent)", async () => {
  const ws = connect(RAW);
  await firstMessage(ws);
  await assert.rejects(sendToExecutor({ action: "inspect" }, 400), /RELAY_TIMEOUT/);
  ws.close();
  await closed(ws);
});
