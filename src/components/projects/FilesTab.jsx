import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Trash2, ExternalLink } from "lucide-react";
import FileUploader from "@/components/projects/FileUploader";
import FolderList from "@/components/projects/FolderList";

export default function FilesTab({ projectId, folders, documents, onRefresh }) {
  const [selectedFolderId, setSelectedFolderId] = useState(null);

  const filteredDocs = selectedFolderId
    ? documents.filter((d) => d.folder_id === selectedFolderId)
    : documents;

  const deleteDoc = async (docId) => {
    await base44.entities.Document.delete(docId);
    onRefresh?.();
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
              {filteredDocs.map((doc) => (
                <div key={doc.id} className="group flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-700 truncate">{doc.name}</p>
                    <p className="text-xs text-zinc-400">
                      {doc.file_type?.toUpperCase()}
                      {doc.extracted_text ? " · Texto extraído" : ""}
                    </p>
                  </div>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-zinc-100 transition text-zinc-400 hover:text-zinc-600">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button onClick={() => deleteDoc(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition text-zinc-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}