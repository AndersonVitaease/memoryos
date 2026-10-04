// ORCH-PREAUTH-ARTIFACT-01: leitor do artefato preauth do despacho (node --import tsx --test).
// Os 4 estados do contrato (sem artefato / válido / expirado / revogado ou hash divergente),
// a compatibilidade com a forma do manifesto preauth, fail-closed estrutural e a guarda
// ANTI-SELF-APPROVE. Fixtures em tmpdir do SO (padrão da suíte do daemon — o teste nunca
// toca /data/manifests de produção).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readPreauthArtifact,
  orchPreauthPath,
  artifactHash16,
  assertPreauthArtifactAccess,
  ORCH_PREAUTH_SUBJECT,
  ORCH_PREAUTH_DEFAULT_PATH,
} from "../src/orchPreauthArtifact.ts";
import { manifestHash16 } from "../src/missionManifest.ts";

const DIR = mkdtempSync(join(tmpdir(), "preauth-artifact-01-"));

function fixture(name: string, body: unknown, mode?: number): string {
  const path = join(DIR, name);
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body, null, 2) + "\n");
  if (mode) chmodSync(path, mode);
  return path;
}

// Forma A do contrato: hash = sha16 do corpo canônico sem o campo "hash".
function contractArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    issuer: "operator",
    subject: ORCH_PREAUTH_SUBJECT,
    grantedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    scope: ["mission_dispatch", "tool_call:tier2"],
    ...overrides,
  };
  return { ...body, hash: artifactHash16(body) };
}

test("1. sem artefato (caminho inexistente) → absent (fail-closed)", () => {
  const r = readPreauthArtifact(join(DIR, "nao-existe.json"));
  assert.equal(r.status, "absent");
  assert.equal(r.reason, "ABSENT");
});

test("2. artefato válido (forma do contrato) → valid, hash16 recalculado bate", () => {
  const path = fixture("valido.json", contractArtifact());
  const r = readPreauthArtifact(path);
  assert.equal(r.status, "valid");
  assert.equal(r.reason, null);
  assert.equal(r.source, "artifact");
  assert.match(String(r.hash16), /^[0-9a-f]{16}$/);
  assert.equal(r.issuer, "operator");
});

test("3. expirado → expired (fail-closed)", () => {
  const path = fixture("expirado.json", contractArtifact({ expiresAt: new Date(Date.now() - 60_000).toISOString() }));
  assert.equal(readPreauthArtifact(path).status, "expired");
});

test("4. revogado (arquivo com revoked:true) → revoked, independe de expiração", () => {
  const path = fixture("revogado.json", { revoked: true });
  assert.equal(readPreauthArtifact(path).status, "revoked");
  assert.equal(readPreauthArtifact(path).reason, "REVOKED");
});

test("5. hash divergente (um byte do corpo mudado) → hash_mismatch (fail-closed)", () => {
  const tampered = contractArtifact();
  tampered.issuer = "intruso"; // corpo alterado depois do hash
  const path = fixture("hash-divergente.json", tampered);
  assert.equal(readPreauthArtifact(path).status, "hash_mismatch");
});

test("6. corrompido / não-objeto / modo inseguro / forma desconhecida → invalid (fail-closed)", () => {
  assert.equal(readPreauthArtifact(fixture("corrompido.json", "{isso não é json")).status, "invalid");
  assert.equal(readPreauthArtifact(fixture("nao-objeto.json", "[1,2,3]")).status, "invalid");
  assert.equal(readPreauthArtifact(fixture("inseguro.json", contractArtifact(), 0o666)).status, "invalid");
  assert.equal(readPreauthArtifact(fixture("forma-desconhecida.json", { foo: "bar" })).status, "invalid");
});

test("7. forma do contrato com subject/scope errados → invalid (fail-closed)", () => {
  assert.equal(readPreauthArtifact(fixture("subject-errado.json", contractArtifact({ subject: "outra-coisa" }))).status, "invalid");
  assert.equal(readPreauthArtifact(fixture("scope-insuficiente.json", contractArtifact({ scope: ["tool_call:tier2"] }))).status, "invalid");
});

test("8. forma B: manifesto preauth válido (engineering.mission.preauth) → valid", () => {
  const body = {
    version: 1,
    mission: ORCH_PREAUTH_SUBJECT,
    holder: ORCH_PREAUTH_SUBJECT,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    operations: [{ id: "dispatch", pattern: "node src/orchestrateConsumeDaemon.mjs" }],
    approvedBy: "operator",
    createdBySubjectHash16: "0123456789abcdef",
  };
  // hash16 pela MESMA função do preauth (manifestHash16 via validateManifest).
  const path = fixture("manifesto-preauth.json", { ...body, hash16: manifestHash16(body) });
  const r = readPreauthArtifact(path);
  assert.equal(r.status, "valid");
  assert.equal(r.source, "preauth-manifest");
  assert.equal(r.issuer, "operator");
});

test("9. forma B: missão divergente / hash16 divergente → fail-closed", () => {
  const body = (mission: string) => ({
    version: 1,
    mission,
    holder: mission,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    operations: [{ id: "dispatch", pattern: "node src/orchestrateConsumeDaemon.mjs" }],
    approvedBy: "operator",
  });
  assert.equal(readPreauthArtifact(fixture("missao-errada.json", body("outra-missao"))).status, "invalid");
  const divergente = { ...body(ORCH_PREAUTH_SUBJECT), hash16: "0".repeat(16) };
  assert.equal(readPreauthArtifact(fixture("hash16-divergente.json", divergente)).status, "hash_mismatch");
  const expirado = { ...body(ORCH_PREAUTH_SUBJECT), expiresAt: new Date(Date.now() - 60_000).toISOString(), hash16: manifestHash16({ ...body(ORCH_PREAUTH_SUBJECT), expiresAt: new Date(Date.now() - 60_000).toISOString() }) };
  assert.equal(readPreauthArtifact(fixture("manifesto-expirado.json", expirado)).status, "expired");
  const revogado = { ...body(ORCH_PREAUTH_SUBJECT), hash16: manifestHash16(body(ORCH_PREAUTH_SUBJECT)), revokedAt: new Date().toISOString() };
  assert.equal(readPreauthArtifact(fixture("manifesto-revogado.json", revogado)).status, "revoked");
});

test("10. override por env (ORCH_PREAUTH_PATH) e default de produção", () => {
  const fake = join(DIR, "override.json");
  writeFileSync(fake, JSON.stringify(contractArtifact()));
  const env = { ORCH_PREAUTH_PATH: fake } as NodeJS.ProcessEnv;
  assert.equal(orchPreauthPath(env), fake);
  assert.equal(readPreauthArtifact(orchPreauthPath(env)).status, "valid");
  assert.equal(orchPreauthPath({} as NodeJS.ProcessEnv), ORCH_PREAUTH_DEFAULT_PATH);
});

test("11. ANTI-SELF-APPROVE: operação que não é leitura é recusada no código (guarda explícita)", () => {
  assert.doesNotThrow(() => assertPreauthArtifactAccess("read", join(DIR, "qualquer.json")));
  assert.throws(() => (assertPreauthArtifactAccess as (op: string, path?: string) => void)("write", join(DIR, "qualquer.json")), /ANTI_SELF_APPROVE/);
  assert.throws(() => (assertPreauthArtifactAccess as (op: string, path?: string) => void)("create", join(DIR, "qualquer.json")), /ANTI_SELF_APPROVE/);
});

test("12. o leitor é só-leitura: artefato inalterado após N leituras (bytes idênticos)", () => {
  const path = fixture("so-leitura.json", contractArtifact());
  const before = readFileSync(path);
  for (let i = 0; i < 3; i += 1) readPreauthArtifact(path);
  assert.equal(readFileSync(path).equals(before), true);
});