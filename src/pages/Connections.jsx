/**
 * Connections — página unificada de Conectores.
 *
 * Simplificação (2026-08-10): a página acumulou, ao longo de vários sprints,
 * painéis de diagnóstico/teste interno (OAuth diagnostics, validação por
 * "Implementation NNN", Architecture Governance, Runtime Bootstrap) ao lado
 * dos cartões de conexão que o usuário realmente usa no dia a dia. Isso
 * tornava a página poluída e difícil de navegar. Removidos os painéis
 * puramente internos/de validação; mantidos apenas os conectores de uso
 * real. O Web Connector (antes só acessível pela rota separada
 * /web-connector) agora vive aqui como uma seção de primeira classe —
 * reduz o número de lugares que o usuário precisa lembrar para gerenciar
 * conexões. A rota /web-connector continua existindo por compatibilidade
 * com links diretos, mas usa o mesmo componente (WebConnectorSection).
 */

import { Shield, Lock, ArrowLeft, Link as LinkIcon } from "lucide-react";
import { Link } from "react-router-dom";

import WebConnectorSection from "@/components/connections/WebConnectorSection";
import GoogleWorkspaceSection from "@/components/connections/GoogleWorkspaceSection";
import MicrosoftWorkspaceSection from "@/components/connections/MicrosoftWorkspaceSection";
import GitHubWorkspaceSection from "@/components/connections/GitHubWorkspaceSection";

const FUTURE_CONNECTORS = [
  { id: "whatsapp", name: "WhatsApp",  description: "Enviar e receber mensagens." },
  { id: "shopify",  name: "Shopify",   description: "Pedidos, produtos e clientes." },
  { id: "erp",      name: "ERP",       description: "Dados do sistema interno." },
];

function SectionHeader({ title }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      {title}
    </h2>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <SectionHeader title={title} />
      {children}
    </div>
  );
}

export default function Connections() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen px-4 py-6 lg:px-6 lg:py-8">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition mb-4">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
          <h1 className="text-2xl font-heading font-bold text-foreground">Conectores</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Conecte seus serviços para ampliar as capacidades do MemoryOS. Cada conexão é opcional —
            você constrói seu próprio MemoryOS, no seu ritmo.
          </p>
        </div>

        {/* Web Connector — RFC-012/013/015: conectar qualquer site (login, com ou sem CAPTCHA/2FA) */}
        <Section title="Sistemas Web (qualquer site)">
          <WebConnectorSection />
        </Section>

        {/* Google Workspace */}
        <Section title="Google Workspace">
          <GoogleWorkspaceSection />
        </Section>

        {/* Microsoft 365 (multi-conta) */}
        <Section title="Microsoft 365">
          <MicrosoftWorkspaceSection />
        </Section>

        {/* GitHub (multi-conta OAuth + seletor de repos) */}
        <Section title="GitHub">
          <GitHubWorkspaceSection />
        </Section>

        {/* Future connectors */}
        <div className="mb-8">
          <SectionHeader title="Em breve" />
          <div className="space-y-2">
            {FUTURE_CONNECTORS.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-muted/30 opacity-60">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Diagnóstico avançado — só quando algo dá errado, não é fluxo do dia a dia */}
        <div className="mb-8">
          <Link
            to="/connector-auth"
            className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-muted/5 hover:bg-muted/10 transition text-xs text-muted-foreground"
          >
            <span className="flex items-center gap-2">
              <LinkIcon className="w-3.5 h-3.5" />
              Diagnóstico avançado de conectores (GitHub PAT, saúde, certificação)
            </span>
          </Link>
        </div>

        {/* Privacy */}
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
