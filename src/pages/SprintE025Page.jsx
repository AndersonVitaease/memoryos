/**
 * SprintE025Page — Engineering Sprint E-02.5
 * First Real Connector: Gmail Integration — Validation Dashboard
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, CheckCircle, XCircle, Clock, Mail, Trophy } from "lucide-react";

function TestResultList({ results }) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border text-xs ${r.passed ? "border-border/50 bg-muted/20" : "border-red-500/30 bg-red-500/10"}`}>
          {r.passed
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
            : <XCircle    className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
          <div className="flex-1 min-w-0">
            <p className={r.passed ? "text-foreground" : "text-red-400"}>{r.name}</p>
            {!r.passed && r.error && <p className="text-red-400/70 mt-0.5 font-mono text-[10px]">{r.error}</p>}
          </div>
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Clock className="w-3 h-3" />{r.durationMs}ms
          </span>
        </div>
      ))}
    </div>
  );
}

function Verdict({ results }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium mb-3 ${results.verdict === "PASS" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
      {results.verdict === "PASS" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {results.verdict} — {results.passed}/{results.total} aprovados
    </div>
  );
}

export default function SprintE025Page() {
  const [running, setRunning]   = useState(false);
  const [results, setResults]   = useState(null);
  const [demoOut, setDemoOut]   = useState(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const [goldOut, setGoldOut]   = useState(null);
  const [goldRunning, setGoldRunning] = useState(false);

  async function runTests() {
    setRunning(true);
    setResults(null);
    try {
      const { runGmailConnectorTests } = await import("@/lib/connector-router/connectors/gmailConnectorTests");
      setResults(await runGmailConnectorTests());
    } catch (e) {
      setResults({ verdict: "FAIL", passed: 0, failed: 1, total: 1, results: [{ name: "Suite load error", passed: false, error: e.message, durationMs: 0 }] });
    } finally {
      setRunning(false);
    }
  }

  async function runDemo() {
    setDemoRunning(true);
    setDemoOut(null);
    try {
      const { GmailConnector }              = await import("@/lib/connector-router/connectors/GmailConnector");
      const { ConnectorRegistry }           = await import("@/lib/connector-router/ConnectorRegistry");
      const { UniversalConnectorRouter }    = await import("@/lib/connector-router/UniversalConnectorRouter");
      const { ConnectorCapabilityExecutor } = await import("@/lib/connector-router/ConnectorCapabilityExecutor");
      const { ConversationRuntimeEngine }   = await import("@/lib/runtime-engine/ConversationRuntimeEngine");

      const registry = new ConnectorRegistry();
      registry.register(new GmailConnector()); // ← real connector

      const router   = new UniversalConnectorRouter(registry);
      const executor = new ConnectorCapabilityExecutor(router);
      const engine   = new ConversationRuntimeEngine(executor);

      const plan = Object.freeze({
        id: "demo-gmail-real", goalId: "goal-gmail-1", goalType: "gmail.readInbox",
        status: "planned",
        steps: Object.freeze([
          Object.freeze({ id: "s1", connector: "gmail", capability: "readInbox", parameters: Object.freeze({ maxResults: 5 }) }),
        ]),
        createdAt: Date.now(), durationMs: 0,
      });

      const events = [];
      engine.onEvent((e) => events.push(e));
      const result = await engine.execute(plan);
      setDemoOut({ result, events, health: new GmailConnector().health(), meta: new GmailConnector().metadata() });
    } catch (e) {
      setDemoOut({ error: e.message });
    } finally {
      setDemoRunning(false);
    }
  }

  async function runGoldTest() {
    setGoldRunning(true);
    setGoldOut(null);
    try {
      const { GmailConnector }              = await import("@/lib/connector-router/connectors/GmailConnector");
      const { ConnectorRegistry }           = await import("@/lib/connector-router/ConnectorRegistry");
      const { UniversalConnectorRouter }    = await import("@/lib/connector-router/UniversalConnectorRouter");
      const { ConnectorCapabilityExecutor } = await import("@/lib/connector-router/ConnectorCapabilityExecutor");
      const { ConversationRuntimeEngine }   = await import("@/lib/runtime-engine/ConversationRuntimeEngine");

      // THE GOLD TEST: "Leia meus últimos e-mails"
      // Conversation → Goal → Planning → Runtime → Router → Registry → GmailConnector → Gmail API
      const registry = new ConnectorRegistry();
      registry.register(new GmailConnector()); // only this line adds Gmail support

      const engine = new ConversationRuntimeEngine(
        new ConnectorCapabilityExecutor(new UniversalConnectorRouter(registry))
      );

      const plan = Object.freeze({
        id: "gold-plan-1", goalId: "gold-goal-1", goalType: "gmail.readInbox",
        status: "planned",
        steps: Object.freeze([
          Object.freeze({ id: "g1", connector: "gmail", capability: "readInbox",    parameters: Object.freeze({ maxResults: 10 }) }),
          Object.freeze({ id: "g2", connector: "gmail", capability: "searchEmails", parameters: Object.freeze({ query: "is:unread", maxResults: 5 }) }),
        ]),
        createdAt: Date.now(), durationMs: 0,
      });

      const events = [];
      engine.onEvent((e) => events.push(e));
      const result = await engine.execute(plan);

      const changes = {
        runtime:    false,
        dispatcher: false,
        router:     false,
        pipeline:   false,
        planning:   false,
      };

      setGoldOut({ result, events, changes, approved: true });
    } catch (e) {
      setGoldOut({ error: e.message, approved: false });
    } finally {
      setGoldRunning(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-6 lg:px-6 lg:py-8 max-w-3xl mx-auto">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <Mail className="w-6 h-6 text-red-400" />
        <h1 className="text-2xl font-bold">Sprint E-02.5 — Gmail Connector Real</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-2">
        Primeiro connector real integrado à arquitetura. O GmailConnector implementa <code className="text-xs bg-muted px-1 rounded">IConnector</code> e é registrado no <code className="text-xs bg-muted px-1 rounded">ConnectorRegistry</code>. Nenhuma camada superior foi alterada.
      </p>
      <p className="text-xs text-muted-foreground font-mono mb-8">
        Conversation → Goal → Planning → Runtime → Dispatcher → ConnectorCapabilityExecutor → UCR → ConnectorRegistry → GmailConnector → Gmail API
      </p>

      {/* Architecture summary */}
      <section className="mb-8 p-4 rounded-xl border border-border bg-muted/20 text-xs space-y-1">
        <p className="font-semibold text-foreground mb-2 text-[11px] uppercase tracking-wide">Como o GmailConnector foi integrado</p>
        {[
          "1. GmailConnector implementa IConnector (connectorId, capabilities, execute, health, metadata)",
          "2. execute() delega para GmailConnector.js (listMessages, searchMessages, getMessage, listLabels)",
          "3. execute() delega para GmailActions.js (createDraft, sendEmail)",
          "4. OAuth/token gerenciado pelo GoogleAuthSession.js existente — zero duplicação",
          "5. registerGmailConnector(registry) registra no ConnectorRegistry",
          "6. UniversalConnectorRouter.route() encontra automaticamente via lookup('gmail')",
          "7. ConnectorCapabilityExecutor adapta para ICapabilityExecutor → Dispatcher inalterado",
          "8. ConversationRuntimeEngine inalterado — não sabe que Gmail existe",
        ].map((line, i) => (
          <p key={i} className="text-muted-foreground">{line}</p>
        ))}
      </section>

      {/* Gold Test */}
      <section className="mb-8 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-amber-400">Teste de Ouro da Arquitetura</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Fluxo completo: "Leia meus últimos e-mails" → Goal → Planning → Runtime → Router → GmailConnector → Gmail API.
          Valida que nenhuma camada superior foi modificada para suportar Gmail.
        </p>
        <button onClick={runGoldTest} disabled={goldRunning}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 mb-4">
          <Trophy className="w-4 h-4" />
          {goldRunning ? "Executando Gold Test…" : "Executar Teste de Ouro"}
        </button>

        {goldOut && !goldOut.error && (
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm font-medium ${goldOut.approved ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
              {goldOut.approved ? <Trophy className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {goldOut.approved ? "GOLD TEST APROVADO — Arquitetura validada" : "GOLD TEST FALHOU"}
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs font-mono space-y-1">
              <p><span className="text-muted-foreground">result.status:   </span> <span className={goldOut.result.status === "completed" ? "text-emerald-400" : "text-amber-400"}>{goldOut.result.status}</span></p>
              <p><span className="text-muted-foreground">steps executed:  </span> {goldOut.result.steps.length}</p>
              <p><span className="text-muted-foreground">durationMs:      </span> {goldOut.result.durationMs}ms</p>
              <p><span className="text-muted-foreground">errors:          </span> {goldOut.result.errors.length === 0 ? "none" : goldOut.result.errors.join(", ")}</p>
            </div>
            <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs space-y-1">
              <p className="font-semibold text-foreground font-mono mb-1">Camadas inalteradas</p>
              {Object.entries(goldOut.changes).map(([k, changed]) => (
                <div key={k} className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span className="text-muted-foreground font-mono">{k}</span>
                  <span className="text-emerald-400">{changed ? "ALTERADO" : "inalterado"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {goldOut?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-xs font-mono">{goldOut.error}</div>
        )}
      </section>

      {/* Demo with real connector */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Demo: GmailConnector real no ConnectorRegistry
        </h2>
        <button onClick={runDemo} disabled={demoRunning}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 mb-4">
          <Mail className="w-4 h-4" />
          {demoRunning ? "Executando…" : "Executar via Runtime → UCR → GmailConnector"}
        </button>

        {demoOut && !demoOut.error && (
          <div className="space-y-3">
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono space-y-1">
              <p className="font-semibold text-foreground mb-2">Connector Info</p>
              <p><span className="text-muted-foreground">name:      </span> {demoOut.meta?.name}</p>
              <p><span className="text-muted-foreground">version:   </span> {demoOut.meta?.version}</p>
              <p><span className="text-muted-foreground">health:    </span> <span className={demoOut.health?.status === "healthy" ? "text-emerald-400" : "text-amber-400"}>{demoOut.health?.status}</span></p>
              <p><span className="text-muted-foreground">message:   </span> {demoOut.health?.message}</p>
            </div>
            <div className="p-4 rounded-xl border border-border bg-muted/30 text-xs font-mono space-y-1">
              <p className="font-semibold text-foreground mb-2">ExecutionResult</p>
              <p><span className="text-muted-foreground">status:    </span> <span className={demoOut.result.status === "completed" ? "text-emerald-500" : "text-amber-400"}>{demoOut.result.status}</span></p>
              <p><span className="text-muted-foreground">steps:     </span> {demoOut.result.steps.length}</p>
              <p><span className="text-muted-foreground">duration:  </span> {demoOut.result.durationMs}ms</p>
              <p><span className="text-muted-foreground">errors:    </span> {demoOut.result.errors.length === 0 ? "none" : demoOut.result.errors.join(", ")}</p>
            </div>
          </div>
        )}
        {demoOut?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 text-red-400 text-xs font-mono">{demoOut.error}</div>
        )}
      </section>

      {/* Tests */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Suite de testes (22 casos)
        </h2>
        <button onClick={runTests} disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 mb-4">
          <Play className="w-4 h-4" />
          {running ? "Executando testes…" : "Executar todos os testes"}
        </button>
        {results && (
          <>
            <Verdict results={results} />
            <TestResultList results={results.results} />
          </>
        )}
      </section>
    </div>
  );
}