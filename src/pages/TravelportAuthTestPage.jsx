import React, { useState } from "react";
import { base44 } from "@/api/base44Client";

/**
 * TravelportAuthTestPage — diagnóstico temporário do Sprint GDS-01.
 * Testa a autenticação OAuth2 do travelportProxy usando o SDK real
 * (mesma rota que qualquer Capability Executor vai usar depois).
 * Não expõe nenhum valor de secret — só status e metadata do token.
 *
 * REMOVER após GDS-01 ser validado (não faz parte da arquitetura final).
 */
export default function TravelportAuthTestPage() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const runTest = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("travelportProxy", { action: "authTest" });
      setResult({ ok: true, data: res?.data ?? res });
    } catch (e) {
      setResult({ ok: false, error: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 32, fontFamily: "monospace", maxWidth: 800 }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>GDS-01 — Travelport Auth Test</h1>
      <p style={{ color: "#666", marginBottom: 16 }}>
        Chama <code>travelportProxy</code> com <code>{`{ action: "authTest" }`}</code>.
        Valida OAuth2 real (username/password/client_id/client_secret/access_group).
        Nenhum secret é exibido.
      </p>
      <button
        onClick={runTest}
        disabled={loading}
        style={{
          padding: "8px 16px",
          background: loading ? "#999" : "#111",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "default" : "pointer",
        }}
      >
        {loading ? "Testando..." : "Rodar authTest"}
      </button>

      {result && (
        <pre
          style={{
            marginTop: 24,
            padding: 16,
            background: result.ok && result.data?.ok ? "#e8f5e9" : "#ffebee",
            border: `1px solid ${result.ok && result.data?.ok ? "#4caf50" : "#f44336"}`,
            borderRadius: 6,
            whiteSpace: "pre-wrap",
            fontSize: 13,
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
