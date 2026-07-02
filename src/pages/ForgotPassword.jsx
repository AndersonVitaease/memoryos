import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await base44.auth.resetPasswordRequest(email);
    } catch (e) { /* always show success */ }
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white font-heading">Recuperar Senha</h1>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          {sent ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-zinc-400">Se esse email estiver cadastrado, você receberá um link para redefinir sua senha.</p>
              <Link to="/login" className="text-sm text-violet-400 hover:text-violet-300 inline-flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label className="text-zinc-400">Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="seu@email.com" required />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar link"}
              </Button>
              <Link to="/login" className="block text-center text-xs text-zinc-500 hover:text-violet-400 transition">Voltar ao login</Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}