import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Loader2 } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const resetToken = urlParams.get("token");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.resetPassword({ resetToken, newPassword: password });
      window.location.href = "/login";
    } catch (err) {
      setError(err.message || "Erro ao redefinir senha.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white font-heading">Nova Senha</h1>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-zinc-400">Nova Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="Mínimo 6 caracteres" required />
            </div>
            <div>
              <Label className="text-zinc-400">Confirmar Nova Senha</Label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="••••••••" required />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Redefinir Senha"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}