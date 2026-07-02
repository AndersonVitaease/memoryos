import React, { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { processDocument } from "@/lib/memoryEngine";

const ACCEPTED = ".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv";

function getFileType(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["docx", "doc"].includes(ext)) return "docx";
  if (ext === "txt") return "txt";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  if (["xlsx", "xls", "csv"].includes(ext)) return "spreadsheet";
  return "other";
}

const statusLabels = {
  pending: { label: "Aguardando...", icon: Loader2, color: "text-zinc-400" },
  processing: { label: "Indexando na memória...", icon: Loader2, color: "text-violet-500" },
  completed: { label: "Na memória do projeto", icon: CheckCircle2, color: "text-emerald-500" },
  failed: { label: "Falha no processamento", icon: AlertCircle, color: "text-red-500" },
};

export default function FileUploader({ projectId, folderId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [processingFiles, setProcessingFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      // Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const fileType = getFileType(file.name);

      // Extrair texto inicial (para tipos suportados)
      let extractedText = "";
      if (["pdf", "docx", "image", "spreadsheet"].includes(fileType)) {
        try {
          const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: {
              type: "object",
              properties: { text: { type: "string", description: "Full text content of the document" } },
              required: ["text"]
            }
          });
          if (result.status === "success" && result.output?.text) {
            extractedText = result.output.text;
          }
        } catch (e) { /* will retry in engine */ }
      } else if (fileType === "txt") {
        try {
          const res = await fetch(file_url);
          extractedText = await res.text();
        } catch (e) { /* skip */ }
      }

      // Criar documento com status pending
      const doc = await base44.entities.Document.create({
        project_id: projectId,
        folder_id: folderId || undefined,
        name: file.name,
        file_url,
        file_type: fileType,
        extracted_text: extractedText,
        size_bytes: file.size,
        processing_status: "pending",
      });

      // Iniciar processamento do Memory Engine
      setProcessingFiles((prev) => [...prev, { id: doc.id, name: file.name, status: "pending" }]);

      // Processar em background (não bloqueia próximo upload)
      processDocument(doc, (status) => {
        setProcessingFiles((prev) =>
          prev.map((f) => (f.id === doc.id ? { ...f, status } : f))
        );
      }).then(() => {
        onUploaded?.();
      });
    }

    setUploading(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles([...e.dataTransfer.files]);
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
          dragOver ? "border-violet-400 bg-violet-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
        }`}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED} multiple className="hidden" onChange={(e) => handleFiles([...e.target.files])} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
            <p className="text-sm text-zinc-500">Enviando arquivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-zinc-400" />
            <p className="text-sm font-medium text-zinc-700">Arraste arquivos aqui ou clique para enviar</p>
            <p className="text-xs text-zinc-400">PDF, DOCX, TXT, Imagens, Planilhas</p>
          </div>
        )}
      </div>

      {/* Processing indicators */}
      {processingFiles.length > 0 && (
        <div className="space-y-2">
          {processingFiles.map((f) => {
            const status = statusLabels[f.status] || statusLabels.pending;
            return (
              <div key={f.id} className="flex items-center gap-3 bg-white rounded-xl border border-zinc-200/80 px-4 py-3">
                <status.icon className={`w-4 h-4 ${status.color} ${f.status === "pending" || f.status === "processing" ? "animate-spin" : ""}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-700 truncate">{f.name}</p>
                  <p className={`text-xs ${status.color}`}>{status.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}