/**
 * Connections — Engineering Sprint E-01
 * Pagina refatorada: orquestra secoes independentes.
 * Sem logica de negocio aqui — apenas composicao de componentes.
 */

import { Shield, Lock, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

import ConnectorRegistry from "@/components/connections/ConnectorRegistry";
import RuntimeBootstrapPanel from "@/components/connections/RuntimeBootstrapPanel";
import GoogleWorkspaceSection from "@/components/connections/GoogleWorkspaceSection";
import GoogleProfileCard from "@/components/connections/GoogleProfileCard";
import GmailConnectorCard from "@/components/connections/GmailConnectorCard";
import GmailActionsCard from "@/components/connections/GmailActionsCard";
import GmailAdvancedCard from "@/components/connections/GmailAdvancedCard";
import ArchitectureGovernancePanel from "@/components/connections/ArchitectureGovernancePanel";
import {
  OAuthInitDiagnosticsPanel,
  OAuth007TestPanel,
  WorkspaceIntegrationPanel,
  AuthTestPanel,
  GmailCISTestPanel,
  CalendarTestPanel,
  DriveTestPanel,
} from "@/components/connections/DiagnosticsSection";

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
            Conecte seus servicos para ampliar as capacidades do MemoryOS. Cada conexao e opcional —
            voce constroi seu proprio MemoryOS, no seu ritmo.
          </p>
        </div>

        {/* Autenticacao e saude dos conectores (GitHub PAT, Base44, health monitor) */}
        <Section title="Autenticação de Conectores">
          <Link
            to="/connector-auth"
            className="flex items-center justify-between p-4 rounded-xl border border-border/40 bg-muted/5 hover:bg-muted/10 transition"
          >
            <div>
              <p className="text-sm font-semibold">Central de Autenticação de Conectores</p>
              <p className="text-xs text-muted-foreground mt-1">
                Conectar GitHub (token PAT), Base44, monitorar saúde e rodar certificação
              </p>
            </div>
            <Shield className="w-5 h-5 text-muted-foreground" />
          </Link>
        </Section>

        {/* Architecture Governance — Sprint 8.5 */}
        <Section title="Architecture Governance — Sprint 8.5">
          <ArchitectureGovernancePanel />
        </Section>

        {/* Runtime Bootstrap — Sprint 8.2 */}
        <Section title="Runtime Bootstrap — Sprint 8.2">
          <div className="p-4 rounded-xl border border-border/40 bg-muted/5">
            <RuntimeBootstrapPanel />
          </div>
        </Section>

        {/* Connector Registry */}
        <Section title="Connector Registry">
          <ConnectorRegistry />
        </Section>

        {/* Google Workspace */}
        <Section title="Disponivel agora">
          <GoogleWorkspaceSection />
        </Section>

        {/* Profile */}
        <Section title="Perfil Google — Implementation 008">
          <GoogleProfileCard />
        </Section>

        {/* Gmail read */}
        <Section title="Gmail — Implementation 009">
          <GmailConnectorCard />
        </Section>

        {/* Gmail write */}
        <Section title="Gmail Acoes — Implementation 010">
          <GmailActionsCard />
        </Section>

        {/* Gmail advanced */}
        <Section title="Gmail Avancado — Implementation 011">
          <GmailAdvancedCard />
        </Section>

        {/* OAuth Diagnostics */}
        <Section title="Diagnostico OAuth Init">
          <OAuthInitDiagnosticsPanel />
        </Section>

        {/* OAuth 007 tests */}
        <Section title="OAuth 2.0 Backend — Implementation 007">
          <OAuth007TestPanel />
        </Section>

        {/* Workspace integration */}
        <Section title="Google Workspace Integration — Implementation 006">
          <WorkspaceIntegrationPanel />
        </Section>

        {/* Tests 001 */}
        <Section title="Validacao — Implementation 001 (GoogleAuthSession)">
          <AuthTestPanel />
        </Section>

        {/* Tests 002/003 */}
        <Section title="Validacao — Implementation 002/003 (GmailConnector + CIS)">
          <GmailCISTestPanel />
        </Section>

        {/* Tests 004 */}
        <Section title="Validacao — Implementation 004 (GoogleCalendarConnector)">
          <CalendarTestPanel />
        </Section>

        {/* Tests 005 */}
        <Section title="Validacao — Implementation 005 (GoogleDriveConnector)">
          <DriveTestPanel />
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

        {/* Privacy */}
        <div className="p-4 rounded-xl bg-muted/50 border border-border">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Privacidade e Controle</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Toda integracao informa claramente quais dados serao acessados e quais permissoes
                serao concedidas. Voce pode desconectar qualquer servico a qualquer momento. Sua
                memoria permanece preservada — o que pertence a voce, fica com voce.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}