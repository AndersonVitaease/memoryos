import React, { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, LayoutGrid, FileText, Users, Calendar, Tag as TagIcon, MessageSquare } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProjectOverview from "@/components/projects/ProjectOverview";
import FilesTab from "@/components/projects/FilesTab";
import PersonManager from "@/components/projects/PersonManager";
import EventTimeline from "@/components/projects/EventTimeline";
import TagManager from "@/components/projects/TagManager";
import ChatPage from "@/pages/ChatPage";

const typeLabels = {
  pessoal: "Pessoal", empresa: "Empresa", condominio: "Condomínio", turismo: "Turismo", outro: "Outro"
};

const tabClass = "data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 data-[state=active]:bg-transparent rounded-none px-0 pb-3 pt-3 text-sm font-medium whitespace-nowrap";

export default function ProjectDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [people, setPeople] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const initialTab = searchParams.get("tab") || "overview";

  useEffect(() => { loadProject(); }, [id]);

  const loadProject = async () => {
    setLoading(true);
    const [p, docs, flds, ppl, evts] = await Promise.all([
      base44.entities.Project.get(id),
      base44.entities.Document.filter({ project_id: id }, "-created_date", 50),
      base44.entities.Folder.filter({ project_id: id }, "created_date", 50),
      base44.entities.Person.filter({ project_id: id }, "created_date", 50),
      base44.entities.TimelineEvent.filter({ project_id: id }, "-event_date", 100),
    ]);
    setProject(p);
    setDocuments(docs);
    setFolders(flds);
    setPeople(ppl);
    setEvents(evts);
    setLoading(false);
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
      <div className="px-6 lg:px-10 py-5 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <Link to="/projects" className="p-1.5 rounded-lg hover:bg-zinc-100 transition">
            <ArrowLeft className="w-4 h-4 text-zinc-500" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-zinc-900 font-heading">{project.name}</h1>
              {project.type && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{typeLabels[project.type] || project.type}</span>
              )}
            </div>
            {project.description && <p className="text-sm text-zinc-500">{project.description}</p>}
          </div>
        </div>
      </div>

      <Tabs defaultValue={initialTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 lg:px-10 border-b border-zinc-200 bg-white">
          <TabsList className="bg-transparent h-auto p-0 gap-6 overflow-x-auto">
            <TabsTrigger value="overview" className={tabClass}><LayoutGrid className="w-4 h-4 mr-1.5" />Visão Geral</TabsTrigger>
            <TabsTrigger value="files" className={tabClass}><FileText className="w-4 h-4 mr-1.5" />Arquivos</TabsTrigger>
            <TabsTrigger value="people" className={tabClass}><Users className="w-4 h-4 mr-1.5" />Pessoas</TabsTrigger>
            <TabsTrigger value="events" className={tabClass}><Calendar className="w-4 h-4 mr-1.5" />Eventos</TabsTrigger>
            <TabsTrigger value="tags" className={tabClass}><TagIcon className="w-4 h-4 mr-1.5" />Tags</TabsTrigger>
            <TabsTrigger value="chat" className={tabClass}><MessageSquare className="w-4 h-4 mr-1.5" />Chat</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-y-auto m-0">
          <ProjectOverview project={project} documents={documents} folders={folders} people={people} events={events} />
        </TabsContent>

        <TabsContent value="files" className="flex-1 overflow-y-auto m-0">
          <FilesTab projectId={id} folders={folders} documents={documents} onRefresh={loadProject} />
        </TabsContent>

        <TabsContent value="people" className="flex-1 overflow-y-auto m-0">
          <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            <PersonManager projectId={id} />
          </div>
        </TabsContent>

        <TabsContent value="events" className="flex-1 overflow-y-auto m-0">
          <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            <EventTimeline projectId={id} />
          </div>
        </TabsContent>

        <TabsContent value="tags" className="flex-1 overflow-y-auto m-0">
          <div className="p-6 lg:p-10 max-w-4xl mx-auto">
            <TagManager projectId={id} />
          </div>
        </TabsContent>

        <TabsContent value="chat" className="flex-1 overflow-hidden m-0">
          <ChatPage projectId={id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}