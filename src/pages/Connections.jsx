import React from "react";
import { Mail, Shield, ArrowLeft, Check, X, Plug, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { CONNECTOR_REGISTRY } from "@/lib/connectors/registry";

/**
 * Connections — página de gestão de Conectores.
 *
 * Princípios do Prompt Mestre:
 * - Toda integração é opcional. Representa evolução da experiência.
 * - O usuário conecta apenas os serviços que desejar.
 * - O usuário mantém controle total: pode desconectar a qualquer momento.
 * - Toda integração informa claramente: dados acessados, permissões, ações.
 *
 * Jornada: Gmail é o único conector do Beta oficial.
 */
export default function Connections() {
  console.log('[CHAIN][4-Connections] RENDER START');
  const registry = Array.isArray(CONNECTOR_REGISTRY) ? CONNECTOR_REGISTRY : [];
  const betaConnectors = registry.filter((c) => c.beta);
  const futureConnectors = registry.filter((c) => !c.beta);

  console.log('[CHAIN][4-Connections] → betaConnectors:', betaConnectors.length, '| futureConnectors:', futureConnectors.length, '→ RETORNANDO JSX');
  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <h1 className="text-2xl font-heading font-bold text-foreground">Conectores</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Conecte seus serviços para ampliar as capacidades do MemoryOS. Cada conexão é opcional —
            você constrói seu próprio MemoryOS, no seu ritmo.
          </p>
        </div>

        {/* Beta connectors */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Disponíveis agora
          </h2>
          <div className="space-y-3">
            {betaConnectors.map((connector) => (
              <ConnectorCard key={connector.id} connector={connector} />
            ))}
          </div>
        </div>

        {/* Future connectors */}
        {futureConnectors.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Em breve
            </h2>
            <div className="space-y-2">
              {futureConnectors.map((connector) => (
                <div
                  key={connector.id}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/30 opacity-60"
                >
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{connector.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{connector.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Privacy note */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Privacidade e Controle</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Toda integração informa claramente quais dados serão acessados e quais permissões
                serão concedidas. Você pode desconectar qualquer serviço a qualquer momento. Sua
                memória permanece preservada — o que pertence a você, fica com você.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConnectorCard({ connector }) {
  console.log('[CHAIN][5-ConnectorCard] RENDER — id:', connector?.id);
  const isConnected = connector.connected;

  return (
    <div className="p-5 rounded-xl border border-border bg-card">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-semibold text-foreground">{connector.name}</h3>
            {isConnected ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <Check className="w-3 h-3" /> Conectado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                <X className="w-3 h-3" /> Não conectado
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{connector.description}</p>
          {connector.privacyNote && (
            <p className="text-xs text-muted-foreground/70 mt-2">{connector.privacyNote}</p>
          )}
          <button
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition"
          >
            <Plug className="w-4 h-4" />
            {isConnected ? "Desconectar" : "Conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}