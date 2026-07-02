import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { User, Plus, Trash2, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const roleLabels = {
  cliente: "Cliente", fornecedor: "Fornecedor", funcionario: "Funcionário", parceiro: "Parceiro", outro: "Outro"
};
const roleColors = {
  cliente: "bg-blue-50 text-blue-600", fornecedor: "bg-amber-50 text-amber-600",
  funcionario: "bg-violet-50 text-violet-600", parceiro: "bg-emerald-50 text-emerald-600", outro: "bg-zinc-100 text-zinc-600"
};

export default function PersonManager({ projectId }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", role: "cliente", email: "", phone: "", notes: "" });

  useEffect(() => { loadPeople(); }, [projectId]);

  const loadPeople = async () => {
    setLoading(true);
    const data = await base44.entities.Person.filter({ project_id: projectId }, "created_date", 50);
    setPeople(data);
    setLoading(false);
  };

  const addPerson = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await base44.entities.Person.create({ project_id: projectId, ...form, name: form.name.trim() });
    setForm({ name: "", role: "cliente", email: "", phone: "", notes: "" });
    setShowAdd(false);
    loadPeople();
  };

  const deletePerson = async (id) => {
    await base44.entities.Person.delete(id);
    loadPeople();
  };

  if (loading) return <p className="text-sm text-zinc-400">Carregando...</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-zinc-500">{people.length} pessoas</h3>
        <Button size="sm" onClick={() => setShowAdd(true)} className="bg-zinc-900 hover:bg-zinc-800 gap-1.5">
          <Plus className="w-4 h-4" /> Adicionar
        </Button>
      </div>

      {people.length === 0 ? (
        <div className="text-center py-12 text-sm text-zinc-400">
          <User className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          Nenhuma pessoa adicionada.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {people.map((person) => (
            <div key={person.id} className="group bg-white rounded-xl border border-zinc-200/80 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center">
                    <User className="w-4 h-4 text-zinc-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{person.name}</p>
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full mt-0.5 ${roleColors[person.role] || roleColors.outro}`}>
                      {roleLabels[person.role] || person.role}
                    </span>
                  </div>
                </div>
                <button onClick={() => deletePerson(person.id)} className="p-1.5 opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-red-500 transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {(person.email || person.phone) && (
                <div className="mt-3 space-y-1 text-xs text-zinc-500">
                  {person.email && <p className="flex items-center gap-1.5"><Mail className="w-3 h-3" />{person.email}</p>}
                  {person.phone && <p className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{person.phone}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Pessoa</DialogTitle></DialogHeader>
          <form onSubmit={addPerson} className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" required />
            </div>
            <div>
              <Label>Relação</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(roleLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
            </div>
            <div><Label>Notas</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" rows={2} /></div>
            <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800">Adicionar</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}