import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * RegressionTest271Page — Rollback BUGFIX-002.7.1
 *
 * Testa o fluxo:
 *   "ler arquivo do repositório AndersonVitaease/memoryos"
 *   → GitHubQueryRouter detecta intent
 *   → OfficialRuntimeBridge.invokeCompatGuarded("github", capability, payload)
 *   → resultado: github.file.read ou github.repository.read
 *
 * Sem alterações de código — apenas observação do fluxo existente.
 */

const TARGET_MESSAGE = "ler arquivo do repositório AndersonVitaease/memoryos";

export default function RegressionTest271Page() {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(null);

  async function runRegression() {
    setRunning(true);
    setResults([]);
    setSummary(null);
    const log = [];

    function addLog(label, status, detail, extra = {}) {
      const entry = { id: Date.now() + Math.random(), label, status, detail, ...extra };
      log.push(entry);
      setResults([...log]);
    }

    try {
      // ── Step 1: GitHubQueryRouter ──────────────────────────────────────────
      addLog("GitHubQueryRouter.route()", "running", "Classificando intenção...");
      const { GitHubQueryRouter } = await import("@/lib/conversation-cognitive-gateway/GitHubQueryRouter");
      const router = new GitHubQueryRouter();
      const route = router.route(TARGET_MESSAGE);

      log[log.length - 1] = {
        ...log[log.length - 1],
        status: route.isGitHubQuery ? "pass" : "fail",
        detail: route.isGitHubQuery
          ? `isGitHubQuery=true | capability=${route.capability} | confidence=${(route.confidence * 100).toFixed(0)}%`
          : `isGitHubQuery=false — router não detectou intent GitHub`,
        extra: { capability: route.capability, payload: route.payload, keywords: route.matchedKeywords },
      };
      setResults([...log]);

      if (!route.isGitHubQuery) {
        setSummary({ verdict: "FAIL", reason: "GitHubQueryRouter não detectou query GitHub" });
        setRunning(false);
        return;
      }

      // ── Step 2: RepositoryResolver ─────────────────────────────────────────
      addLog("RepositoryResolver", "running", "Extraindo owner/repo da mensagem...");
      const ownerMatch = TARGET_MESSAGE.match(/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
      const owner = ownerMatch?.[1] ?? null;
      const repo  = ownerMatch?.[2] ?? null;

      log[log.length - 1] = {
        ...log[log.length - 1],
        status: owner && repo ? "pass" : "warn",
        detail: owner && repo
          ? `owner=${owner} repo=${repo} (extraído da mensagem)`
          : `owner/repo não extraído — capability=${route.capability} usará payload vazio`,
      };
      setResults([...log]);

      // ── Step 3: OfficialRuntimeBridge.invokeCompatGuarded ─────────────────
      addLog("OfficialRuntimeBridge.invokeCompatGuarded", "running",
        `Invocando github.${route.capability}...`);

      const { officialRuntimeBridge } = await import(
        "@/lib/cognitive-connector/OfficialRuntimeBridge"
      );

      const payload = { ...(route.payload ?? {}) };
      if (owner) payload.owner = owner;
      if (repo)  payload.repo  = repo;

      const t0 = performance.now();
      const result = await officialRuntimeBridge.invokeCompatGuarded(
        "github",
        route.capability,
        payload,
      );
      const durationMs = (performance.now() - t0).toFixed(1);

      const isSuccess = result.record.status === "SUCCESS";
      const isDivergence = result.record.status === "CONNECTOR_DIVERGENCE";
      const isNotConfigured = result.record.status === "NOT_CONFIGURED";

      log[log.length - 1] = {
        ...log[log.length - 1],
        status: isSuccess ? "pass" : isDivergence ? "fail" : isNotConfigured ? "warn" : "fail",
        detail: isSuccess
          ? `SUCCESS — connector=github | capability=${route.capability} | ${durationMs}ms`
          : isDivergence
            ? `CONNECTOR_DIVERGENCE — guard bloqueou execução incorreta`
            : isNotConfigured
              ? `NOT_CONFIGURED — GitHub token não injetado (esperado em ambiente sem PAT)`
              : `${result.record.status} — ${result.record.error ?? "erro desconhecido"}`,
        raw: result,
      };
      setResults([...log]);

      // ── Step 4: Verificar que connector = github (nunca google-drive) ────
      addLog("Verificação: connector≠google-drive", "running", "Verificando guard anti-divergência...");

      const connectorWasGitHub = isSuccess || isNotConfigured; // google-drive nunca deve aparecer
      const connectorWasDrive  = isDivergence &&
        result.record.error?.includes("google-drive");

      log[log.length - 1] = {
        ...log[log.length - 1],
        status: connectorWasDrive ? "fail" : "pass",
        detail: connectorWasDrive
          ? `FALHA CRÍTICA: google-drive executado para query GitHub!`
          : `OK — google-drive NÃO foi executado | status=${result.record.status}`,
      };
      setResults([...log]);

      // ── Veredicto Final ────────────────────────────────────────────────────
      const passed = log.filter(e => e.status === "pass").length;
      const failed = log.filter(e => e.status === "fail").length;
      const warned = log.filter(e => e.status === "warn").length;

      setSummary({
        verdict: failed === 0 ? (warned > 0 ? "PASS_WITH_WARNINGS" : "PASS") : "FAIL",
        passed, failed, warned,
        connectorStatus: result.record.status,
        capability: route.capability,
        durationMs,
        reason: isSuccess
          ? `github.${route.capability} executado com sucesso`
          : isNotConfigured
            ? `github.${route.capability} roteado corretamente (token não injetado — esperado)`
            : isDivergence
              ? `CONNECTOR_DIVERGENCE detectado — verificar CIS_TO_GOAL_TYPE`
              : `Falha inesperada: ${result.record.status}`,
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push({ id: Date.now(), label: "ERRO", status: "fail", detail: msg });
      setResults([...log]);
      setSummary({ verdict: "ERROR", reason: msg });
    }

    setRunning(false);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-mono">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="border border-zinc-800 rounded-lg p-6 space-y-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-yellow-600 text-yellow-100">ROLLBACK</Badge>
            <Badge className="bg-zinc-700 text-zinc-200">BUGFIX-002.7.1</Badge>
          </div>
          <h1 className="text-xl font-bold text-zinc-100">Regression Test — File Read</h1>
          <p className="text-zinc-400 text-sm">
            Verifica se o fluxo <code className="text-violet-400">github.file.read</code> funciona
            no estado anterior à 002.7.1
          </p>
          <div className="mt-3 p-3 bg-zinc-900 rounded border border-zinc-800">
            <p className="text-xs text-zinc-500 mb-1">MENSAGEM DE TESTE</p>
            <p className="text-green-400 text-sm">&quot;{TARGET_MESSAGE}&quot;</p>
          </div>
        </div>

        {/* Run Button */}
        <Button
          onClick={runRegression}
          disabled={running}
          className="w-full bg-violet-700 hover:bg-violet-600 text-white"
        >
          {running ? "Executando regressão..." : "▶ Executar Teste de Regressão"}
        </Button>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            {results.map((r) => (
              <Card key={r.id} className={`p-4 border ${
                r.status === "pass"    ? "bg-green-950 border-green-800" :
                r.status === "fail"    ? "bg-red-950 border-red-800" :
                r.status === "warn"    ? "bg-yellow-950 border-yellow-800" :
                "bg-zinc-900 border-zinc-700"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">
                    {r.status === "pass" ? "✅" :
                     r.status === "fail" ? "❌" :
                     r.status === "warn" ? "⚠️" : "⏳"}
                  </span>
                  <span className="text-zinc-200 font-semibold text-sm">{r.label}</span>
                </div>
                <p className="text-zinc-300 text-xs pl-7">{r.detail}</p>
                {r.extra && (
                  <pre className="text-zinc-500 text-xs mt-2 pl-7 whitespace-pre-wrap">
                    {JSON.stringify(r.extra, null, 2)}
                  </pre>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Summary */}
        {summary && (
          <Card className={`p-6 border-2 ${
            summary.verdict === "PASS"               ? "bg-green-950 border-green-600" :
            summary.verdict === "PASS_WITH_WARNINGS" ? "bg-yellow-950 border-yellow-600" :
            summary.verdict === "FAIL"               ? "bg-red-950 border-red-600" :
            "bg-zinc-900 border-zinc-600"
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">
                {summary.verdict.startsWith("PASS") ? "✅" : "❌"}
              </span>
              <div>
                <p className="text-lg font-bold">{summary.verdict}</p>
                <p className="text-sm text-zinc-300">{summary.reason}</p>
              </div>
            </div>
            {summary.capability && (
              <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                <div className="bg-zinc-900 rounded p-2">
                  <p className="text-zinc-500">Capability</p>
                  <p className="text-violet-400 font-mono">github.{summary.capability}</p>
                </div>
                <div className="bg-zinc-900 rounded p-2">
                  <p className="text-zinc-500">Status</p>
                  <p className={summary.connectorStatus === "SUCCESS" ? "text-green-400" : "text-yellow-400"}>
                    {summary.connectorStatus}
                  </p>
                </div>
                <div className="bg-zinc-900 rounded p-2">
                  <p className="text-zinc-500">Duration</p>
                  <p className="text-zinc-300">{summary.durationMs}ms</p>
                </div>
              </div>
            )}
          </Card>
        )}

        <p className="text-zinc-600 text-xs text-center">
          Sem alterações de código — observação do fluxo existente pós-rollback 002.7.1
        </p>
      </div>
    </div>
  );
}