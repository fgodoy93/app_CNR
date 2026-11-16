'use client';

import { useState } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { ShieldCheck, Droplets, MapPin } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@cnr.gob.cl');
  const [password, setPassword] = useState('Cnr2026!Demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const res = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Error en inicio de sesión');

      localStorage.setItem('tc_token', data.accessToken);
      if (data.refreshToken) localStorage.setItem('tc_refresh_token', data.refreshToken);
      localStorage.setItem('tc_user', JSON.stringify(data.user));
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f2f6f4]">
      <div className="gob-stripe" />
      <div className="flex-1 flex items-center justify-center p-4 bg-gradient-to-br from-[#006fb3]/5 via-[#f2f6f4] to-[#146c43]/10">
        <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white rounded-2xl shadow-xl border border-[#d9e2ec] overflow-hidden">
          {/* Panel Institucional */}
          <div className="md:col-span-2 bg-gradient-to-b from-[#006fb3] via-[#0f69c4] to-[#146c43] text-white p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <BrandMark size={42} />
                <div>
                  <div className="text-xs uppercase tracking-wider text-emerald-200 font-semibold">
                    Gobierno de Chile
                  </div>
                  <div className="font-bold text-lg leading-tight">CNR</div>
                </div>
              </div>

              <h2 className="text-xl font-bold leading-snug mb-3">
                Plataforma de Gestión Hídrica y Agrícola en Terreno
              </h2>
              <p className="text-xs text-blue-100 leading-relaxed">
                Supervisión de obras de riego, levantamiento geoespacial y fiscalización en terreno para la Comisión Nacional de Riego (CNR) del Ministerio de Agricultura.
              </p>
            </div>

            <div className="space-y-3 pt-8 border-t border-white/15 text-xs text-blue-100">
              <div className="flex items-center gap-2.5">
                <Droplets className="w-4 h-4 text-sky-300 shrink-0" />
                <span>Trazabilidad de obras y canales de riego</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>Captura GPS offline (GeoJSON / KML)</span>
              </div>
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Evidencia cifrada y firma de actas QR</span>
              </div>
            </div>
          </div>

          {/* Formulario de Acceso */}
          <div className="md:col-span-3 p-8 md:p-10 flex flex-col justify-center">
            <div className="mb-6">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 text-[#146c43] border border-emerald-200 mb-2">
                Portal Institucional Web
              </span>
              <h1 className="text-2xl font-bold text-[#0f241d]">Iniciar Sesión</h1>
              <p className="text-sm text-slate-500 mt-1">
                Ingrese sus credenciales institucionales para acceder al panel de gestión.
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#cbd5d1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e7490] text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-[#cbd5d1] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e7490] text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary btn-default-size w-full"
              >
                {loading ? 'Ingresando...' : 'Ingresar a Plataforma'}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Perfiles de demostración rápida
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@cnr.gob.cl');
                    setPassword('Cnr2026!Demo');
                  }}
                  className="btn btn-outline-primary btn-sm"
                >
                  Administrador CNR
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEmail('terreno@cnr.gob.cl');
                    setPassword('Cnr2026!Demo');
                  }}
                  className="btn btn-outline-primary btn-sm"
                >
                  Inspector Terreno
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
