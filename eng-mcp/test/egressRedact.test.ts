// SEC-FIX-01: egress redaction applied by the gpu-bridge shim/proxy BEFORE any
// request body leaves for OpenRouter. Fixture secrets are synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { redactEgressText, redactEgressBody } from "../scripts/egress-redact.mjs";

const FAKE = {
  orKey: "sk-or-v1-" + "a1B2c3D4e5F6g7H8i9J0".repeat(2),
  ghp: "ghp_" + "Z9y8X7w6V5u4T3s2R1q0P9o8",
  pat: "github_pat_" + "11ABCDEFG0123456789_abcdefghijklmnop",
  bearer: "Bearer " + "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
  aws: "AKIA" + "ABCDEFGHIJKLMNOP",
  kv: "password=" + "hunter2hunter2",
};

test("secret enters, comes out redacted (every pattern)", () => {
  for (const [k, secret] of Object.entries(FAKE)) {
    const out = redactEgressText(`before ${secret} after`);
    assert.ok(!out.includes(secret), `${k} leaked: ${out}`);
    assert.match(out, /\[REDACTED/, `${k} not marked`);
    assert.match(out, /^before .*after$/, `${k} destroyed context`);
  }
});

test("chat-completions body: nested message content and tool args are redacted", () => {
  const body = {
    model: "x/y",
    messages: [
      { role: "user", content: "use token " + FAKE.ghp },
      { role: "user", content: [{ type: "text", text: "auth: " + FAKE.bearer }] },
      { role: "assistant", tool_calls: [{ function: { name: "Bash", arguments: JSON.stringify({ command: "curl -H 'Authorization: " + FAKE.bearer + "'" }) } }] },
    ],
    max_tokens: 100,
  };
  const { body: out, redactions } = redactEgressBody(body);
  const wire = JSON.stringify(out);
  for (const s of [FAKE.ghp, FAKE.bearer]) assert.ok(!wire.includes(s), "leaked " + s);
  assert.ok(redactions >= 3, "redactions=" + redactions);
  assert.equal(out.model, "x/y");
  assert.equal(out.max_tokens, 100);
  assert.equal(body.messages[0].content, "use token " + FAKE.ghp, "input must not be mutated");
});

test("clean text passes untouched (no false positive on ordinary prose/code)", () => {
  const clean = "const x = getToken(); // see https://github.com/owner/repo and commit 26aaa555";
  assert.equal(redactEgressText(clean), clean);
  assert.equal(redactEgressBody({ a: clean }).redactions, 0);
});
