import React, { useEffect, useState } from 'react';
import { Shield, Plus, Trash2, X, Loader2, Check, Zap, Eye, PenTool } from 'lucide-react';
import { supabase, Role, Permission } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';

interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

const NAV_MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  council_records: 'Council Records',
  meetings: 'Meetings',
  chatbot: 'Chatbot',
  notifications: 'Notifications',
  announcements: 'Announcements',
  members: 'Members',
  audit_logs: 'Audit Logs',
  roles: 'Roles & Permissions',
  chatbot_setup: 'Chatbot Setup',
};

const CRUD_MODULE_LABELS: Record<string, string> = {
  council_records: 'Council Records',
  meetings: 'Meetings',
  announcements: 'Announcements',
  members: 'Members',
  roles: 'Roles',
  audit_logs: 'Audit Logs',
  chatbot: 'Chatbot',
  notifications: 'Notifications',
  navigation: 'Navigation',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
  send: 'Send',
  manage: 'Manage',
};

type TabId = 'navigation' | 'crud';

export default function RolesPermissionsPage() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<RoleWithPermissions | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDisplay, setNewRoleDisplay] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleFullPledge, setNewRoleFullPledge] = useState(false);
  const [editingPerms, setEditingPerms] = useState<Set<string>>(new Set());
  const [editingFullPledge, setEditingFullPledge] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('navigation');
  const [confirmDelete, setConfirmDelete] = useState<RoleWithPermissions | null>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [rolesRes, permsRes] = await Promise.all([
      supabase.from('roles').select('*').order('display_name'),
      supabase.from('permissions').select('*').order('module').order('action'),
    ]);

    const rolesData = rolesRes.data || [];
    const permsData = permsRes.data || [];
    setAllPermissions(permsData);

    const rolesWithPerms: RoleWithPermissions[] = await Promise.all(
      rolesData.map(async (role) => {
        const { data: rpData } = await supabase
          .from('role_permissions')
          .select('permission_id')
          .eq('role_id', role.id);
        const permIds = new Set((rpData || []).map((rp: { permission_id: string }) => rp.permission_id));
        return { ...role, permissions: permsData.filter((p) => permIds.has(p.id)) };
      })
    );

    setRoles(rolesWithPerms);
    if (rolesWithPerms.length > 0 && !selectedRole) {
      setSelectedRole(rolesWithPerms[0]);
      setEditingPerms(new Set(rolesWithPerms[0].permissions.map((p) => p.id)));
      setEditingFullPledge(rolesWithPerms[0].is_full_pledge);
    } else if (selectedRole) {
      const updated = rolesWithPerms.find((r) => r.id === selectedRole.id);
      if (updated) {
        setSelectedRole(updated);
        setEditingPerms(new Set(updated.permissions.map((p) => p.id)));
        setEditingFullPledge(updated.is_full_pledge);
      }
    }
    setLoading(false);
  }

  function selectRole(role: RoleWithPermissions) {
    setSelectedRole(role);
    setEditingPerms(new Set(role.permissions.map((p) => p.id)));
    setEditingFullPledge(role.is_full_pledge);
  }

  function togglePerm(permId: string) {
    setEditingPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }

  async function savePermissions() {
    if (!selectedRole) return;
    setSaving(true);
    await supabase.from('role_permissions').delete().eq('role_id', selectedRole.id);
    if (editingPerms.size > 0) {
      const inserts = Array.from(editingPerms).map((permId) => ({ role_id: selectedRole.id, permission_id: permId }));
      await supabase.from('role_permissions').insert(inserts);
    }
    await supabase.from('roles').update({ is_full_pledge: editingFullPledge }).eq('id', selectedRole.id);
    await logAuditEvent(user?.id || null, 'update_permissions', 'roles', selectedRole.id, 'role', {
      role_name: selectedRole.name, is_full_pledge: editingFullPledge, tab: activeTab,
    });
    await fetchData();
    setSaving(false);
  }

  async function handleCreateRole() {
    if (!newRoleName || !newRoleDisplay) return;
    setSaving(true);
    const slug = newRoleName.toLowerCase().replace(/\s+/g, '_');
    const { data } = await supabase.from('roles').insert({
      name: slug, display_name: newRoleDisplay, description: newRoleDesc, is_full_pledge: newRoleFullPledge,
    }).select().maybeSingle();
    if (data) await logAuditEvent(user?.id || null, 'create_role', 'roles', data.id, 'role', { name: slug, is_full_pledge: newRoleFullPledge });
    setShowCreate(false);
    setNewRoleName('');
    setNewRoleDisplay('');
    setNewRoleDesc('');
    setNewRoleFullPledge(false);
    await fetchData();
    setSaving(false);
  }

  async function handleDeleteRole() {
    if (!confirmDelete || confirmDelete.is_system) return;
    await supabase.from('roles').delete().eq('id', confirmDelete.id);
    await logAuditEvent(user?.id || null, 'delete_role', 'roles', confirmDelete.id, 'role', { name: confirmDelete.name });
    setConfirmDelete(null);
    if (selectedRole?.id === confirmDelete.id) setSelectedRole(null);
    await fetchData();
  }

  const navPermissions = allPermissions.filter((p) => p.action === 'navigate');
  const crudActions = ['create', 'read', 'update', 'delete'];
  const NON_TABLE_MODULES = ['dashboard'];
  const crudPermissions = allPermissions.filter((p) => crudActions.includes(p.action) && !NON_TABLE_MODULES.includes(p.module));
  const crudModules = [...new Set(crudPermissions.map((p) => p.module))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Roles & Permissions</h2>
            <p className="text-slate-400 text-sm">Manage navigation access and CRUD permissions</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg text-sm">
          <Plus className="w-4 h-4" />
          New Role
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Roles List */}
          <div className="space-y-2">
            <h3 className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">Roles</h3>
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => selectRole(role)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                  selectedRole?.id === role.id
                    ? 'bg-blue-600/20 border-blue-500/30 text-white'
                    : 'bg-slate-800/50 border-white/5 text-slate-300 hover:border-white/10 hover:text-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{role.display_name}</p>
                    {role.is_full_pledge && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full">
                        <Zap className="w-3 h-3" />
                        Full-Pledge
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{role.permissions.length} permissions</p>
                </div>
                <div className="flex items-center gap-2">
                  {role.is_system && <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full">System</span>}
                  {!role.is_system && (
                    <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(role); }} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Permissions Editor */}
          <div className="lg:col-span-2">
            {selectedRole ? (
              <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-white/5">
                  <div>
                    <h3 className="text-white font-semibold">{selectedRole.display_name}</h3>
                    <p className="text-slate-400 text-sm">{selectedRole.description || 'No description'}</p>
                  </div>
                  <button onClick={savePermissions} disabled={saving || selectedRole.name === 'super_admin'} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium px-4 py-2 rounded-xl disabled:opacity-50 text-sm transition-colors">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Save
                  </button>
                </div>

                {selectedRole.name === 'super_admin' ? (
                  <div className="p-6 text-center">
                    <Shield className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                    <p className="text-white font-medium">Super Admin has full access</p>
                    <p className="text-slate-400 text-sm mt-1">Permissions cannot be restricted for this role</p>
                  </div>
                ) : (
                  <>
                    {/* Tabs */}
                    <div className="flex border-b border-white/5">
                      <button
                        onClick={() => setActiveTab('navigation')}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${
                          activeTab === 'navigation'
                            ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                            : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        Navigation Access
                      </button>
                      <button
                        onClick={() => setActiveTab('crud')}
                        className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${
                          activeTab === 'crud'
                            ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                            : 'text-slate-400 border-transparent hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <PenTool className="w-4 h-4" />
                        CRUD Access
                      </button>
                    </div>

                    <div className="p-5 space-y-6 max-h-[55vh] overflow-y-auto">
                      {/* Full-Pledge Toggle (shown in both tabs) */}
                      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                              <Zap className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                              <p className="text-white text-sm font-medium">Full-Pledge Access</p>
                              <p className="text-slate-400 text-xs">Grants full chatbot knowledge access in n8n workflows</p>
                            </div>
                          </div>
                          <div
                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${editingFullPledge ? 'bg-amber-500' : 'bg-slate-700'}`}
                            onClick={() => setEditingFullPledge(!editingFullPledge)}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${editingFullPledge ? 'left-6' : 'left-1'}`} />
                          </div>
                        </div>
                      </div>

                      {/* Navigation Access Tab */}
                      {activeTab === 'navigation' && (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-slate-300 text-sm font-medium">Page Visibility in Side Navigation</p>
                            <button
                              onClick={() => {
                                setEditingPerms((prev) => {
                                  const next = new Set(prev);
                                  const allNavChecked = navPermissions.every((p) => next.has(p.id));
                                  if (allNavChecked) navPermissions.forEach((p) => next.delete(p.id));
                                  else navPermissions.forEach((p) => next.add(p.id));
                                  return next;
                                });
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            >
                              {navPermissions.every((p) => editingPerms.has(p.id)) ? 'Deselect all' : 'Select all'}
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {navPermissions.map((perm) => (
                              <div
                                key={perm.id}
                                onClick={() => togglePerm(perm.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all select-none border ${
                                  editingPerms.has(perm.id)
                                    ? 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/15'
                                    : 'bg-white/5 border-white/5 hover:bg-white/10'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${editingPerms.has(perm.id) ? 'bg-blue-500 border-blue-500' : 'border-white/20 bg-transparent'}`}>
                                  {editingPerms.has(perm.id) && <Check className="w-3 h-3 text-white" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-white text-sm font-medium">{NAV_MODULE_LABELS[perm.module] || perm.module}</p>
                                  <p className="text-slate-500 text-xs truncate">{perm.description || `Show ${perm.module} in navigation`}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* CRUD Access Tab */}
                      {activeTab === 'crud' && (
                        <div className="space-y-6">
                          {crudModules.map((module) => {
                            const modulePerms = crudPermissions.filter((p) => p.module === module);
                            const allChecked = modulePerms.every((p) => editingPerms.has(p.id));
                            return (
                              <div key={module}>
                                <div className="flex items-center justify-between mb-3">
                                  <h4 className="text-slate-300 text-sm font-medium">{CRUD_MODULE_LABELS[module] || module}</h4>
                                  <button
                                    onClick={() => {
                                      setEditingPerms((prev) => {
                                        const next = new Set(prev);
                                        if (allChecked) modulePerms.forEach((p) => next.delete(p.id));
                                        else modulePerms.forEach((p) => next.add(p.id));
                                        return next;
                                      });
                                    }}
                                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                                  >
                                    {allChecked ? 'Deselect all' : 'Select all'}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  {modulePerms.map((perm) => (
                                    <div
                                      key={perm.id}
                                      onClick={() => togglePerm(perm.id)}
                                      className="flex items-center gap-2 p-2.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors select-none"
                                    >
                                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${editingPerms.has(perm.id) ? 'bg-blue-500 border-blue-500' : 'border-white/20 bg-transparent'}`}>
                                        {editingPerms.has(perm.id) && <Check className="w-3 h-3 text-white" />}
                                      </div>
                                      <span className="text-slate-300 text-xs">{ACTION_LABELS[perm.action] || perm.action}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 bg-slate-800/50 border border-white/5 rounded-2xl">
                <p className="text-slate-400">Select a role to manage permissions</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Role Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">Create New Role</h3>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Role Name (slug)</label>
                <input value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="e.g., finance_admin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Display Name</label>
                <input value={newRoleDisplay} onChange={(e) => setNewRoleDisplay(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="e.g., Finance Admin" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <input value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="Role description..." />
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-300 text-sm">Full-Pledge Access</span>
                  </div>
                  <div
                    className={`w-10 h-6 rounded-full transition-colors relative cursor-pointer ${newRoleFullPledge ? 'bg-amber-500' : 'bg-slate-700'}`}
                    onClick={() => setNewRoleFullPledge(!newRoleFullPledge)}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${newRoleFullPledge ? 'left-5' : 'left-1'}`} />
                  </div>
                </div>
                <p className="text-slate-500 text-xs mt-2">Allows full chatbot knowledge access in n8n</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleCreateRole} disabled={saving || !newRoleName || !newRoleDisplay} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 text-sm">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Role"
        message={`Are you sure you want to delete "${confirmDelete?.display_name}"? This will remove all associated permissions and cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteRole}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
