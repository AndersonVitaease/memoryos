import React from "react";
import {
  FileText,
  Image as ImageIcon,
  Mic,
  FileType,
  Sheet,
  ClipboardPaste,
  Link as LinkIcon,
  X,
} from "lucide-react";

const OPTIONS = [
  { type: "pdf", label: "PDF", icon: FileText },
  { type: "image", label: "Imagem", icon: ImageIcon },
  { type: "audio", label: "Áudio", icon: Mic },
  { type: "word", label: "Word", icon: FileType },
  { type: "excel", label: "Excel", icon: Sheet },
  { type: "text", label: "Colar texto", icon: ClipboardPaste },
  { type: "link", label: "Link", icon: LinkIcon },
];

export default function AttachmentMenu({ onSelect, onClose }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />

      <div className="absolute bottom-full mb-2 left-0 z-40 w-56 rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-zinc-700">Adicionar conteúdo</span>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="py-1">
          {OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => onSelect(option.type)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50 transition text-left"
            >
              <option.icon className="w-4 h-4 text-zinc-500 shrink-0" />
              <span className="text-sm text-zinc-700">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}