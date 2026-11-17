'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { api } from '@/lib/api';
import { Plus } from 'lucide-react';

export default function UsuariosPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ name: '', roleId: '', unitId: '', password: '' });
  const [form, setForm] = useState({ email: '', name: '', password: '', roleId: '', unitId: '' });
  const [unitForm, setUnitForm] = useState({ code: '', name: '' });
  const [roleForm, setRoleForm] = useState({ key: '', name: '', permissions: 'activities.read.unit,activities.create,activities.write' });
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    Promise.all([
      api.get<{ data: any[] }>('/api/v1/admin/users'),
      api.get<{ data: any[] }>('/api/v1/admin/roles'),
      api.get<{ data: any[] }>('/api/v1/admin/units'),
    ])
      .then(([u, r, un]) => {
        setUsers(u.data);
        setRoles(r.data);
        setUnits(un.data);
        if (r.data[0]) setForm((f) => ({ ...f, roleId: f.roleId || r.data[0].id }));
      })
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    load();
  }, []);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/v1/admin/users', { ...form, unitId: form.unitId || null });
      setShowModal(false);
      setForm((f) => ({ ...f, email: '', name: '', password: '' }));
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/v1/admin/units', unitForm);
      setShowUnitModal(false);
      setUnitForm({ code: '', name: '' });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/v1/admin/roles', {
        key: roleForm.key,
        name: roleForm.name,
        permissions: roleForm.permissions.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setShowRoleModal(false);
      setRoleForm({ key: '', name: '', permissions: 'activities.read.unit,activities.create,activities.write' });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleActive = async (u: any) => {
    await api.patch(`/api/v1/admin/users/${u.id}`, { active: !u.active });
    load();
  };

  const openEditUser = (u: any) => {
    setError(null);
    setMsg(null);
    setEditingUser(u);
    setEditForm({
      name: u.name || '',
      roleId: u.role?.id || '',
      unitId: u.unit?.id || '',
      password: '',
    });
  };

  const saveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setError(null);
    setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        roleId: editForm.roleId,
        unitId: editForm.unitId || null,
      };
      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }
      await api.patch(`/api/v1/admin/users/${editingUser.id}`, payload);
      setMsg(
        editForm.password.trim()
          ? `Usuario ${editForm.name} y contraseña actualizados.`
          : `Usuario ${editForm.name} actualizado.`,
      );
      setEditingUser(null);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <AppShell title="Administración de Usuarios, Roles y Unidades">
      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
      {msg && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <p className="text-sm text-slate-500">Capacidad licenciada: {users.filter((u) => u.active).length} / 45 usuarios habilitados</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowUnitModal(true)} className="btn btn-outline-secondary btn-default-size">
            <Plus className="w-4 h-4" /> Unidad
          </button>
          <button onClick={() => setShowRoleModal(true)} className="btn btn-outline-secondary btn-default-size">
            <Plus className="w-4 h-4" /> Rol
          </button>
          <button onClick={() => setShowModal(true)} className="btn btn-primary btn-default-size">
            <Plus className="w-4 h-4" /> Nuevo Usuario
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto mb-6">
        <table className="w-full text-sm text-left min-w-[640px]">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Perfil / Rol</th>
              <th className="px-4 py-3">Unidad Institucional</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-xs font-medium">{u.role.name}</span></td>
                <td className="px-4 py-3 text-slate-600">{u.unit?.name || 'Todas'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <button onClick={() => openEditUser(u)} className="text-xs font-semibold text-[#006fb3] hover:underline">
                      Editar / Clave
                    </button>
                    <button onClick={() => toggleActive(u)} className="text-xs text-slate-600 hover:underline">
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-3">Unidades Institucionales ({units.length})</h3>
          <div className="space-y-2 text-sm">
            {units.map((un) => (
              <div key={un.id} className="p-2.5 border rounded-lg flex justify-between">
                <span className="font-medium">{un.name}</span>
                <span className="font-mono text-xs text-slate-500">{un.code}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200">
          <h3 className="font-semibold text-slate-800 mb-3">Roles y Permisos ({roles.length})</h3>
          <div className="space-y-2 text-sm">
            {roles.map((r) => (
              <div key={r.id} className="p-2.5 border rounded-lg">
                <div className="font-medium">{r.name} <span className="font-mono text-xs text-slate-400">({r.key})</span></div>
                <div className="text-xs text-slate-500 mt-1">{r.permissions.join(', ')}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={createUser} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Crear Usuario</h3>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nombre completo" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="correo@cnr.gob.cl" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Contraseña (mín. 8 caracteres)" className="w-full px-3 py-2 border rounded-lg text-sm" required minLength={8} />
            <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" required>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Sin unidad específica</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-outline-secondary btn-default-size">Cancelar</button>
              <button type="submit" className="btn btn-primary btn-default-size">Crear</button>
            </div>
          </form>
        </div>
      )}

      {showUnitModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={createUnit} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Nueva Unidad Institucional</h3>
            <input value={unitForm.code} onChange={(e) => setUnitForm({ ...unitForm, code: e.target.value.toUpperCase() })} placeholder="Código (ej. DEPTO_ESTUDIOS)" className="w-full px-3 py-2 border rounded-lg text-sm font-mono" required />
            <input value={unitForm.name} onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Nombre completo de la unidad" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowUnitModal(false)} className="btn btn-outline-secondary btn-default-size">Cancelar</button>
              <button type="submit" className="btn btn-primary btn-default-size">Crear Unidad</button>
            </div>
          </form>
        </div>
      )}

      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={createRole} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg">Nuevo Rol / Perfil</h3>
            <input value={roleForm.key} onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value.toLowerCase() })} placeholder="clave (ej. auditor)" className="w-full px-3 py-2 border rounded-lg text-sm font-mono" required />
            <input value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} placeholder="Nombre del rol" className="w-full px-3 py-2 border rounded-lg text-sm" required />
            <textarea value={roleForm.permissions} onChange={(e) => setRoleForm({ ...roleForm, permissions: e.target.value })} rows={2} className="w-full px-3 py-2 border rounded-lg text-xs font-mono" required />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowRoleModal(false)} className="btn btn-outline-secondary btn-default-size">Cancelar</button>
              <button type="submit" className="btn btn-primary btn-default-size">Crear Rol</button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <form onSubmit={saveEditUser} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-bold text-lg text-[#006fb3]">Editar Usuario / Restablecer Clave</h3>
            <p className="text-xs text-slate-500">{editingUser.email}</p>
            <input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Nombre completo"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              required
            />
            <select
              value={editForm.roleId}
              onChange={(e) => setEditForm({ ...editForm, roleId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select
              value={editForm.unitId}
              onChange={(e) => setEditForm({ ...editForm, unitId: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">Todas las unidades</option>
              {units.map((un) => <option key={un.id} value={un.id}>{un.name}</option>)}
            </select>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Nueva contraseña (dejar vacío para mantener la actual)
              </label>
              <input
                type="password"
                minLength={8}
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingUser(null)} className="btn btn-outline-secondary btn-default-size">
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary btn-default-size">
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
