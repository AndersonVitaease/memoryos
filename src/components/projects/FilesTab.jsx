import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Trash2, ExternalLink, Loader2, CheckCircle2, AlertCircle, Brain, Tag as TagIcon } from "lucide-react";
import FileUploader from "@/components/projects/FileUploader";
import FolderList from "@/components/projects/FolderList";
import PdfToolsButton from "@/components/projects/PdfToolsButton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";

const categoryLabels = {
  contrato: "Contrato", financeiro: "Financeiro", marketing: "Marketing", produto: "Produto",
  juridico: "Jurídico", comercial: "Comercial", atendimento: "Atendimento", reuniao: "Reunião",
  planejamento: "Planejamento", outro: "Outro"
};

const categoryColors = {
  contrato: "bg-amber-50 text-amber-700", financeiro: "bg-emerald-50 text-emerald-700",
  marketing: "bg-rose-50 text-rose-700", produto: "bg-blue-50 text-blue-700",
  juridico: "bg-red-50 text-red-700", comercial: "bg-violet-50 text-violet-700",
  atendimento: "bg-cyan-50 text-cyan-700", reuniao: "bg-indigo-50 text-indigo-700",
  planejamento: "bg-teal-50 text-teal-700", outro: "bg-zinc-100 text-zinc-600"
};

const statusConfig = {
  pending: { label: "Aguardando", icon: Loader2, color: "text-zinc-400", spin: true },
  processing: { label: "Indexando", icon: Loader2, color: "text-violet-500", spin: true },
  completed: { label: "Na memória", icon: CheckCircle2, color: "text-emerald-500", spin: false },
  failed: { label: "Falha", icon: AlertCircle, color: "text-red-500", spin: false },
};

export default function FilesTab({ projectId, folders, documents, onRefresh }) {
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [entities, setEntities] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [toast, setToast] = useState(null); // { msg, type }

  const notify = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const filteredDocs = selectedFolderId
    ? documents.filter((d) => d.folder_id === selectedFolderId)
    : documents;

  const deleteDoc = async (docId) => {
    await base44.entities.Document.delete(docId);
    onRefresh?.();
  };

  const openDetail = async (doc) => {
    setDetailDoc(doc);
    const [ents, kws] = await Promise.all([
      base44.entities.KnowledgeEntity.filter({ document_id: doc.id }, "created_date", 50),
      base44.entities.Keyword.filter({ document_id: doc.id }, "created_date", 50),
    ]);
    setEntities(ents);
    setKeywords(kws);
  };

  const entityTypeLabels = {
    pessoa: "Pessoa", empresa: "Empresa", organizacao: "Organização", produto: "Produto",
    local: "Local", data: "Data", horario: "Horário", numero: "Número",
    valor_monetario: "Valor", telefone: "Telefone", email: "Email", site: "Site"
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6">
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-3 h-fit">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide px-3 py-2">Pastas</h3>
          <FolderList projectId={projectId} selectedFolderId={selectedFolderId} onSelectFolder={setSelectedFolderId} />
        </div>

        <div className="space-y-4">
          <FileUploader projectId={projectId} folderId={selectedFolderId} onUploaded={onRefresh} />

          {filteredDocs.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-200/80 divide-y divide-zinc-100">
              {filteredDocs.map((doc) => {
                const status = statusConfig[doc.processing_status] || statusConfig.pending;
                return (
                  <div key={doc.id} className="group flex items-center gap-3 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <FileText className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openDetail(doc)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-zinc-700 truncate">{doc.name}</p>
                        {doc.category && (
                          <span className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[doc.category] || categoryColors.outro}`}>
                            {categoryLabels[doc.category]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <status.icon className={`w-3 h-3 ${status.color} ${status.spin ? "animate-spin" : ""}`} />
                        <span className={`text-xs ${status.color}`}>{status.label}</span>
                        <span className="text-xs text-zinc-400">· {doc.file_type?.toUpperCase()}</span>
                      </div>
                    </div>
                    {doc.processing_status === "completed" && (
                      <button onClick={() => openDetail(doc)} className="p-1.5 rounded-lg hover:bg-violet-50 transition text-zinc-400 hover:text-violet-600">
                        <Brain className="w-4 h-4" />
                      </button>
                    )}
                    {doc.file_type === "pdf" && doc.file_url && (
                      <PdfToolsButton
                        doc={doc}
                        allPdfs={documents.filter((d) => d.file_type === "pdf" && d.file_url)}
                        onNotification={notify}
                      />
                    )}
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-zinc-100 transition text-zinc-400 hover:text-zinc-600">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition text-zinc-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Knowledge detail dialog */}
      <Dialog open={!!detailDoc} onOpenChange={(v) => !v && setDetailDoc(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          {detailDoc && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-violet-500" />
                  Conhecimento Extraído
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-5">
                {/* Summary */}
                {detailDoc.summary && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Resumo</h4>
                    <div className="prose prose-sm prose-zinc max-w-none">
                      <ReactMarkdown>{detailDoc.summary}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Category */}
                {detailDoc.category && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">Categoria</h4>
                    <span className={`text-xs px-3 py-1 rounded-full ${categoryColors[detailDoc.category] || categoryColors.outro}`}>
                      {categoryLabels[detailDoc.category]}
                    </span>
                  </div>
                )}

                {/* Entities */}
                {entities.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                      Entidades ({entities.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {entities.map((e, i) => (
                        <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600">
                          <span className="font-medium text-zinc-400">{entityTypeLabels[e.type] || e.type}:</span>
                          {e.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Keywords */}
                {keywords.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1">
                      <TagIcon className="w-3 h-3" /> Palavras-chave ({keywords.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((k, i) => (
                        <span key={i} className="text-xs px-2 py-1 rounded-lg bg-violet-50 text-violet-700 border border-violet-200">
                          {k.keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {detailDoc.processing_status !== "completed" && (
                  <div className="flex items-center gap-2 text-sm text-zinc-400 bg-zinc-50 rounded-lg p-3">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Este documento ainda está sendo processado...
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}