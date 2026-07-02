import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Brain, Loader2 } from "lucide-react";

export default function Register() {
  const [step, setStep] = useState("register"); // register | otp
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.register({ email, password });
      setStep("otp");
    } catch (err) {
      setError(err.message || "Erro ao criar conta.");
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token } = await base44.auth.verifyOtp({ email, otpCode });
      base44.auth.setToken(access_token);
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Código inválido.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await base44.auth.resendOtp(email);
    } catch (e) { /* silent */ }
  };

  const handleGoogle = () => {
    base44.auth.loginWithProvider("google", "/");
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white font-heading">Criar Conta</h1>
          <p className="text-sm text-zinc-500 mt-1">Comece a organizar sua memória</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          {step === "register" ? (
            <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <Label className="text-zinc-400">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="seu@email.com" required />
                </div>
                <div>
                  <Label className="text-zinc-400">Senha</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="Mínimo 6 caracteres" required />
                </div>
                <div>
                  <Label className="text-zinc-400">Confirmar Senha</Label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600" placeholder="••••••••" required />
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Conta"}
                </Button>
              </form>

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
                <div className="relative flex justify-center"><span className="bg-zinc-900 px-3 text-xs text-zinc-600">ou</span></div>
              </div>

              <Button onClick={handleGoogle} variant="outline" className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white">
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continuar com Google
              </Button>
            </>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <p className="text-sm text-zinc-400 text-center">Enviamos um código para <strong className="text-white">{email}</strong></p>
              <div>
                <Label className="text-zinc-400">Código de verificação</Label>
                <Input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} className="mt-1.5 bg-zinc-800 border-zinc-700 text-white text-center text-lg tracking-widest placeholder:text-zinc-600" placeholder="000000" required />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 text-white">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verificar"}
              </Button>
              <button type="button" onClick={handleResend} className="w-full text-xs text-zinc-500 hover:text-violet-400 transition">Reenviar código</button>
            </form>
          )}

          <p className="text-center mt-5 text-xs text-zinc-600">
            Já tem conta? <Link to="/login" className="text-violet-400 hover:text-violet-300 transition">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}