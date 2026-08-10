/**
 * WebConnectorPage — rota /web-connector (mantida por compatibilidade com
 * links diretos e favoritos). O conteúdo real agora vive em
 * WebConnectorSection, embutido também na página de Conectores
 * (src/pages/Connections.jsx) — simplificação pedida em 2026-08-10 para
 * reduzir o número de lugares separados que o usuário precisa lembrar.
 */
import React from 'react';
import { Link as LinkIcon } from 'lucide-react';
import WebConnectorSection from '@/components/connections/WebConnectorSection';

export default function WebConnectorPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
            <LinkIcon className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Conectar novo sistema</h1>
            <p className="text-xs text-zinc-500">Também disponível na página de Conectores</p>
          </div>
        </div>
        <WebConnectorSection />
      </div>
    </div>
  );
}
