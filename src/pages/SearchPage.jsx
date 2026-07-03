import React, { useState } from "react";
import { Search, FileText, Loader2, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { retrieveContext } from "@/lib/contextRetrieval";
import { base44 } from "@/api/base44Client";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setLoading(true);
    setAnswer("");
    setSources([]);

    // Usa o sistema de recuperação inteligente de contexto
    const { context, sources: retrievedSources } = await retrieveContext(query.trim(), null, null);

    const prompt = `Você é o sistema de busca inteligente do MemoryOS.
O usuário está procurando informações na base de conhecimento.

${context ? `CONHECIMENTO RECUPERADO:\n${context}` : "Nenhum conhecimento encontrado na memória do sistema."}

PERGUNTA: ${query.trim()}

Responda de forma clara e objetiva em português brasileiro.
Indique de qual documento ou projeto veio a informação quando relevante.
Se não encontrar a informação, diga que não está na memória do sistema.`;

    const response = await base44.integrations.Core.InvokeLLM({ prompt });

    setAnswer(response);
    setSources(retrievedSources);
    setLoading(false);
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900 font-heading">Pesquisa Inteligente</h1>
        <p className="text-sm text-zinc-500 mt-1">Busque em toda a sua memória — documentos, conversas e conhecimento extraído.</p>
      </div>

      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Quando fechamos contrato com esse fornecedor?"
            className="w-full pl-12 pr-4 py-4 rounded-2xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-400 transition-all bg-white"
            disabled={loading}
          />
          {loading && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-500 animate-spin" />}
        </div>
      </form>

      {answer && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-zinc-200/80 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold text-zinc-900 font-heading">Resposta</h3>
            </div>
            <div className="prose prose-sm prose-zinc max-w-none">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          </div>

          {sources.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-500 mb-3">Fontes consultadas ({sources.length})</h3>
              <div className="bg-white rounded-2xl border border-zinc-200/80 divide-y divide-zinc-100">
                {sources.map((src) => (
                  <Link
                    key={src.id}
                    to={`/projects/${src.project_id || ""}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 transition"
                  >
                    <FileText className="w-4 h-4 text-zinc-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-zinc-700">{src.name}</p>
                      <p className="text-xs text-zinc-400">{src.type}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!answer && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-zinc-400 text-sm">Pergunte qualquer coisa. O sistema buscará em toda a sua memória.</p>
        </div>
      )}
    </div>
  );
}