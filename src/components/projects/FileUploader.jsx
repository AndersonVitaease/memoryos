import React, { useState, useRef } from "react";
import { Upload, FileText, Image, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";

const ACCEPTED = ".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp";

function getFileType(name) {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["docx", "doc"].includes(ext)) return "docx";
  if (ext === "txt") return "txt";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return "other";
}

export default function FileUploader({ projectId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files.length) return;
    setUploading(true);

    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const fileType = getFileType(file.name);

      let extractedText = "";
      if (["pdf", "docx", "image"].includes(fileType)) {
        try {
          const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
            file_url,
            json_schema: { type: "object", properties: { text: { type: "string", description: "Full text content of the document" } }, required: ["text"] }
          });
          if (result.status === "success" && result.output?.text) {
            extractedText = result.output.text;
          }
        } catch (e) { /* extraction optional */ }
      } else if (fileType === "txt") {
        try {
          const res = await fetch(file_url);
          extractedText = await res.text();
        } catch (e) { /* skip */ }
      }

      await base44.entities.Document.create({
        project_id: projectId,
        name: file.name,
        file_url,
        file_type: fileType,
        extracted_text: extractedText,
        size_bytes: file.size,
      });
    }

    setUploading(false);
    onUploaded?.();
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles([...e.dataTransfer.files]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
        dragOver ? "border-violet-400 bg-violet-50" : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        className="hidden"
        onChange={(e) => handleFiles([...e.target.files])}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
          <p className="text-sm text-zinc-500">Enviando e processando...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-8 h-8 text-zinc-400" />
          <p className="text-sm font-medium text-zinc-700">Arraste arquivos aqui ou clique para enviar</p>
          <p className="text-xs text-zinc-400">PDF, DOCX, TXT, Imagens</p>
        </div>
      )}
    </div>
  );
}