'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  MapPin,
  FileSpreadsheet,
  GitBranch,
  Users,
  Webhook,
  ShieldCheck,
  Bell,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { api, getToken, getUser, logout, type StoredUser } from '@/lib/api';
import { BrandMark } from '@/components/BrandMark';

const NAV_GROUPS = [
  {
    title: 'Operación Terreno',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/actividades', label: 'Actividades y OT', icon: ClipboardList },
      { href: '/mapa', label: 'Mapa Terreno', icon: MapPin },
    ],
  },
  {
    title: 'Diseño de Procesos',
    items: [
      { href: '/formularios', label: 'Formularios', icon: FileSpreadsheet },
      { href: '/workflows', label: 'Flujos de Trabajo', icon: GitBranch },
    ],
  },
  {
    title: 'Administración',
    items: [
      { href: '/usuarios', label: 'Usuarios y Unidades', icon: Users },
      { href: '/integraciones', label: 'Integraciones / MCP', icon: Webhook },
      { href: '/auditoria', label: 'Auditoría y Correos', icon: ShieldCheck },
    ],
  },
];

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<{ id: string; title: string; body?: string; readAt?: string | null; link?: string | null }[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = '/';
      return;
    }
    setUser(getUser());
    api
      .get<{ data: typeof notifications; unread: number }>('/api/v1/admin/notifications')
      .then((res) => {
        setNotifications(res.data);
        setUnread(res.unread);
      })
      .catch(() => undefined);
  }, []);

  const markRead = async (id: string) => {
    await api.post(`/api/v1/admin/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
  };

  return (
    <div className="min-h-screen flex bg-[#f2f6f4] text-[#0f241d]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-[#006fb3] via-[#0a3456] to-[#082942] text-white flex flex-col transition-transform lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="gob-stripe shrink-0" />
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <BrandMark size={34} />
            <div>
              <div className="font-bold text-base tracking-tight leading-tight">CNR</div>
              <div className="text-[10px] text-sky-200 font-medium">Comisión Nacional de Riego</div>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="lg:hidden text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300/80">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        active
                          ? 'bg-[#146c43] text-white shadow-sm border-l-4 border-emerald-300'
                          : 'text-slate-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-white/15 text-xs bg-black/15">
          <div className="font-semibold truncate">{user?.name || 'Cargando...'}</div>
          <div className="text-emerald-200/90 truncate">{user?.role || ''} · {user?.unit?.code || 'CNR'}</div>
          <button
            onClick={logout}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="gob-stripe lg:hidden" />
        <header className="h-16 bg-white border-b border-[#d9e2ec] px-4 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-slate-100">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-[#006fb3] truncate">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-[#146c43] border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Red Hídrica · Minagri
            </span>
            <div className="relative">
            <button
              onClick={() => setShowNotifs((v) => !v)}
              className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              aria-label="Notificaciones"
            >
              <Bell className="w-5 h-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {unread}
                </span>
              )}
            </button>

            {showNotifs && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
                <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm flex justify-between items-center">
                  <span>Notificaciones</span>
                  <span className="text-xs text-slate-500">{unread} sin leer</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">Sin notificaciones</div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => !n.readAt && markRead(n.id)}
                      className={`p-3 border-b border-slate-100 text-sm cursor-pointer hover:bg-slate-50 ${
                        !n.readAt ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="font-medium text-slate-800">{n.title}</div>
                      {n.body && <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>}
                    </div>
                  ))
                )}
              </div>
            )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>

        <footer className="mt-auto bg-white border-t border-[#d9e2ec]">
          <div className="gob-stripe" />
          <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
            <div className="font-semibold text-[#006fb3]">
              Comisión Nacional de Riego (CNR) · Ministerio de Agricultura · Gobierno de Chile
            </div>
            <div className="text-slate-500">
              CNR · Sistema de Diseño Gobierno Digital
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
