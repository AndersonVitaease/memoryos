import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Calendar } from "lucide-react";
import { safeFormat } from "@/lib/utils/safeDateFormat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function EventTimeline({ projectId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", event_date: "", category: "" });

  useEffect(() => { loadEvents(); }, [projectId]);

  const loadEvents = async () => {
    setLoading(true);
    const data = await base44.entities.TimelineEvent.filter({ project_id: projectId }, "-event_date", 100);
    setEvents(data);
    setLoading(false);
  };

  const addEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.event_date) return;
    await base44.entities.TimelineEvent.create({ project_id: projectId, ...form });
    setForm({ title: "", description: "", event_date: "", category: "" });
    setShowAdd(false);
    loadEvents();
  };

  const deleteEvent = async (id) => {
    await base44.entities.TimelineEvent.delete(id);
    loadEvents();
  };

  if (loading) return <p className="text-sm text-zinc-400">Carregando...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-sm font-medium text-zinc-500">{events.length} eventos</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
          <Plus className="w-4 h-4" /> Adicionar Evento
        </Button>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-400">
          <Calendar className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          Nenhum evento registrado.
        </div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2 top-2 bottom-2 w-px bg-zinc-200" />
          {events.map((event) => (
            <div key={event.id} className="group relative mb-4">
              <div className="absolute -left-[18px] top-1.5 w-3 h-3 rounded-full bg-violet-500 ring-4 ring-white" />
              <div className="bg-white rounded-xl border border-zinc-200/80 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-violet-600">
                        {safeFormat(event.event_date, "dd/MM/yyyy")}
                      </span>
                      {event.category && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">{event.category}</span>
                      )}
                    </div>
                    <h4 className="text-sm font-semibold text-zinc-800">{event.title}</h4>
                    {event.description && <p className="text-sm text-zinc-500 mt-1">{event.description}</p>}
                  </div>
                  <button onClick={() => deleteEvent(event.id)} className="p-1.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Evento</DialogTitle></DialogHeader>
          <form onSubmit={addEvent} className="space-y-3">
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1.5" required /></div>
            <div><Label>Data</Label><Input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="mt-1.5" required /></div>
            <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1.5" placeholder="Ex: Vendas, Fornecedor..." /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1.5" rows={3} /></div>
            <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800">Adicionar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
