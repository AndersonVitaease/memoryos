import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Folder, Plus, Trash2, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function FolderList({ projectId, selectedFolderId, onSelectFolder }) {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => { loadFolders(); }, [projectId]);

  const loadFolders = async () => {
    setLoading(true);
    const data = await base44.entities.Folder.filter({ project_id: projectId }, "created_date", 50);
    setFolders(data);
    setLoading(false);
  };

  const createFolder = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await base44.entities.Folder.create({ project_id: projectId, name: name.trim() });
    setName("");
    setShowCreate(false);
    loadFolders();
  };

  const deleteFolder = async (id) => {
    await base44.entities.Folder.delete(id);
    if (selectedFolderId === id) onSelectFolder?.(null);
    loadFolders();
  };

  if (loading) return <p className="text-xs text-zinc-400 px-3 py-2">Carregando...</p>;

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelectFolder?.(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
          !selectedFolderId ? "bg-violet-50 text-violet-700 font-medium" : "text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        <FolderOpen className="w-4 h-4" />
        Todos os arquivos
      </button>
      {folders.map((folder) => (
        <div key={folder.id} className="group flex items-center">
          <button
            onClick={() => onSelectFolder?.(folder.id)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
              selectedFolderId === folder.id ? "bg-violet-50 text-violet-700 font-medium" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Folder className="w-4 h-4" />
            <span className="truncate">{folder.name}</span>
          </button>
          <button
            onClick={() => deleteFolder(folder.id)}
            className="p-1.5 mr-1 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {showCreate ? (
        <form onSubmit={createFolder} className="flex gap-1.5 px-1 py-1">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da pasta"
            className="h-8 text-sm"
            autoFocus
          />
          <Button type="submit" size="sm" className="h-8 px-3">OK</Button>
        </form>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-50 transition"
        >
          <Plus className="w-4 h-4" />
          Nova pasta
        </button>
      )}
    </div>
  );
}