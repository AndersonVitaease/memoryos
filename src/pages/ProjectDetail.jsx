import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, FileText, MessageSquare, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileUploader from "@/components/projects/FileUploader";
import ChatInterface from "@/components/chat/ChatInterface";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    const [p, docs] = await Promise.all([
      base44.entities.Project.get(id),
      base44.entities.Document.filter({ project_id: id }, "-created_date", 50),
    ]);
    setProject(p);
    setDocuments(docs);
    setLoading(false);
  };

  const deleteDocument = async (docId) => {
    await base44.entities.Document.delete(docId);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-4 border-zinc-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-10 text-center">
        <p className="text-zinc-500">Projeto não encontrado.</p>
        <Link to="/projects" className="text-violet-600 text-sm mt-2 inline-block">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-56px)] lg:h-screen flex flex-col">
      {/* Header */}
      <div className="px-6 lg:px-10 py-5 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="p-1.5 rounded-lg hover:bg-zinc-100 transition">
            <ArrowLeft className="w-4 h-4 text-zinc-500" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 font-heading">{project.name}</h1>
            {project.description && <p className="text-sm text-zinc-500">{project.description}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="chat" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 lg:px-10 border-b border-zinc-200 bg-white">
          <TabsList className="bg-transparent h-auto p-0 gap-6">
            <TabsTrigger value="chat" className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent rounded-none px-0 pb-3 pt-3 text-sm font-medium">
              <MessageSquare className="w-4 h-4 mr-1.5" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="files" className="data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent rounded-none px-0 pb-3 pt-3 text-sm font-medium">
              <FileText className="w-4 h-4 mr-1.5" />
              Arquivos ({documents.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 overflow-hidden m-0">
          <ChatInterface projectId={id} projectName={project.name} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-y-auto m-0">
          <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
            <FileUploader projectId={id} onUploaded={loadProject} />

            {documents.length > 0 && (
              <div className="bg-white rounded-2xl border border-zinc-200/80 divide-y divide-zinc-100">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
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
                    <button onClick={() => deleteDocument(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50 transition text-zinc-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}