import React, { useEffect, useState } from 'react';
import { Users, Plus, CreditCard as Edit2, Trash2, X, Loader2, Search, UserCheck, UserX, Save, Eye, EyeOff } from 'lucide-react';
import { supabase, Profile, Role } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';
import AccessRequestModal from '../components/AccessRequestModal';

const SMTP_SERVICE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smtp-service`;
const CREATE_MEMBER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-member`;
const UPDATE_MEMBER_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-member`;

function generateEmailHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 24px;">
<div style="background:linear-gradient(135deg,#1e293b,#1e293b);border:1px solid rgba(255,255,255,0.05);border-radius:16px;padding:40px 32px;text-align:center;">
<div style="width:48px;height:48px;background:linear-gradient(135deg,#3b82f6,#10b981);border-radius:12px;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;">
<span style="color:white;font-size:20px;font-weight:bold;">FC</span>
</div>
<h1 style="color:#f8fafc;font-size:20px;font-weight:700;margin:0 0 8px;">${title}</h1>
<div style="color:#94a3b8;font-size:14px;line-height:1.6;text-align:left;margin-top:24px;">
${bodyContent}
</div>
<div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.05);">
<p style="color:#64748b;font-size:12px;margin:0;">Family Council System</p>
</div>
</div>
</div>
</body>
</html>`;
}

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  sender_email: string;
  sender_name: string;
  encryption: string;
  is_active: boolean;
}

async function getActiveSmtp(): Promise<SmtpConfig | null> {
  const { data } = await supabase
    .from('smtp_settings')
    .select('*')
    .eq('is_active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return data as SmtpConfig | null;
}

async function sendNotificationEmail(
  smtp: SmtpConfig,
  toEmail: string,
  toName: string,
  subject: string,
  bodyHtml: string,
  triggeredBy: string | null,
  triggerAction: string,
): Promise<boolean> {
  try {
    const res = await fetch(SMTP_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'send',
        smtp: {
          host: smtp.host,
          port: smtp.port,
          username: smtp.username,
          password: smtp.password,
          sender_email: smtp.sender_email,
          sender_name: smtp.sender_name,
          encryption: smtp.encryption,
        },
        to_email: toEmail,
        to_name: toName,
        subject,
        body_html: bodyHtml,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await res.json();

    await supabase.from('email_logs').insert({
      recipient_email: toEmail,
      recipient_name: toName,
      subject,
      body_html: bodyHtml,
      status: result.success ? 'sent' : 'failed',
      error_message: result.success ? '' : result.message,
      smtp_config_id: smtp.id,
      triggered_by: triggeredBy,
      trigger_action: triggerAction,
      trigger_module: 'members',
    });

    return result.success;
  } catch {
    await supabase.from('email_logs').insert({
      recipient_email: toEmail,
      recipient_name: toName,
      subject,
      body_html: bodyHtml,
      status: 'failed',
      error_message: 'Network error sending email',
      smtp_config_id: smtp.id,
      triggered_by: triggeredBy,
      trigger_action: triggerAction,
      trigger_module: 'members',
    });
    return false;
  }
}

export default function MembersPage() {
  const { user, hasPermission, isSuperAdmin } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role_id: '', is_active: true });
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Profile | null>(null);
  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = hasPermission('members', 'create');
  const canEdit = hasPermission('members', 'update');
  const canDelete = hasPermission('members', 'delete');
  const currentUserIsSuperAdmin = isSuperAdmin();

  useEffect(() => { fetchMembers(); fetchRoles(); }, []);

  async function fetchMembers() {
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*, role:roles(*)').order('full_name');
    setMembers((data as Profile[]) || []);
    setLoading(false);
  }

  async function fetchRoles() {
    const { data } = await supabase.from('roles').select('*').order('display_name');
    setRoles(data || []);
  }

  function openCreate() {
    setEditing(null);
    setForm({ full_name: '', email: '', password: '', role_id: '', is_active: true });
    setFormError('');
    setShowPassword(false);
    setShowModal(true);
  }

  function isMemberSuperAdmin(member: Profile): boolean {
    return (member.role as Role | undefined)?.name === 'super_admin';
  }

  function openEdit(member: Profile) {
    if (isMemberSuperAdmin(member) && !currentUserIsSuperAdmin) {
      setAccessRequest({ module: 'members', action: 'update' });
      return;
    }
    setEditing(member);
    setForm({ full_name: member.full_name, email: member.email, password: '', role_id: member.role_id || '', is_active: member.is_active });
    setFormError('');
    setShowPassword(false);
    setShowModal(true);
  }

  async function handleSave() {
    setFormError('');
    if (!form.full_name || !form.email) {
      setFormError('Full Name and Email are required.');
      return;
    }

    const selectedRole = roles.find((r) => r.id === form.role_id);
    if (selectedRole?.name === 'super_admin' && !currentUserIsSuperAdmin) {
      setFormError('You do not have permission to assign the Super Admin role.');
      return;
    }

    setSaving(true);

    if (editing) {
      // Check if email is being changed to one already used by another active member
      if (form.email !== editing.email) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', form.email)
          .neq('id', editing.id)
          .maybeSingle();
        if (existingProfile) {
          setFormError('A member with this email already exists.');
          setSaving(false);
          return;
        }
      }

      if (form.password && form.password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        setSaving(false);
        return;
      }

      // Email and password live in auth.users, which the browser client cannot
      // touch. Updating profiles directly silently discarded password changes,
      // so the whole edit goes through the edge function.
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setFormError('Session expired. Please reload and try again.');
        setSaving(false);
        return;
      }

      const updateRes = await fetch(UPDATE_MEMBER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: editing.id,
          email: form.email,
          full_name: form.full_name,
          role_id: form.role_id || null,
          is_active: form.is_active,
          password: form.password || undefined,
        }),
      });

      const updateResult = await updateRes.json();

      if (!updateResult.success) {
        setFormError(updateResult.message || 'Failed to update member.');
        setSaving(false);
        return;
      }

      await logAuditEvent(user?.id || null, 'update_member', 'members', editing.id, 'profile', {
        full_name: form.full_name,
        email: form.email,
        password_changed: !!updateResult.password_changed,
        email_changed: !!updateResult.email_changed,
      });

      // Send update notification email
      const smtp = await getActiveSmtp();
      if (smtp) {
        const systemUrl = window.location.origin;
        const emailBody = generateEmailHtml(
          'Account Updated',
          `<p style="color:#e2e8f0;">Hello <strong>${form.full_name}</strong>,</p>
<p style="color:#cbd5e1;">Your account on the Family Council System has been updated.</p>
<p style="color:#cbd5e1;">If you have any questions about this change, please contact your system administrator.</p>
<div style="text-align:center;margin:24px 0;">
<a href="${systemUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#10b981);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Go to Family Council System</a>
</div>
<p style="color:#64748b;font-size:12px;">If you did not expect this change, please contact your system administrator.</p>`
        );
        sendNotificationEmail(smtp, form.email, form.full_name, 'Your Account Has Been Updated - Family Council', emailBody, user?.id || null, 'member_updated');
      }
    } else {
      if (!form.password || form.password.length < 8) {
        setFormError('Password must be at least 8 characters.');
        setSaving(false);
        return;
      }

      // Use edge function to create user server-side (avoids switching admin session)
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setFormError('Session expired. Please reload and try again.');
        setSaving(false);
        return;
      }

      const createRes = await fetch(CREATE_MEMBER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role_id: form.role_id || null,
          is_active: form.is_active,
        }),
      });

      const createResult = await createRes.json();

      if (!createResult.success) {
        setFormError(createResult.message || 'Failed to create member.');
        setSaving(false);
        return;
      }

      const newUserId = createResult.user_id;

      await logAuditEvent(user?.id || null, 'create_member', 'members', newUserId, 'profile', { email: form.email, full_name: form.full_name });

      // Send welcome email with credentials
      const smtp = await getActiveSmtp();
      if (smtp) {
        const systemUrl = window.location.origin;
        const emailBody = generateEmailHtml(
          'Welcome to Family Council',
          `<p style="color:#e2e8f0;">Hello <strong>${form.full_name}</strong>,</p>
<p style="color:#cbd5e1;">An account has been created for you on the Family Council System. You can now sign in using the credentials below:</p>
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;margin:16px 0;">
<p style="color:#94a3b8;margin:0 0 8px;font-size:13px;"><strong style="color:#e2e8f0;">Email:</strong> ${form.email}</p>
<p style="color:#94a3b8;margin:0;font-size:13px;"><strong style="color:#e2e8f0;">Temporary Password:</strong> ${form.password}</p>
</div>
<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;padding:12px;margin:16px 0;">
<p style="color:#fbbf24;margin:0;font-size:12px;font-weight:600;">Important: Please change your password after your first login.</p>
</div>
<div style="text-align:center;margin:24px 0;">
<a href="${systemUrl}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#10b981);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">Login to Family Council System</a>
</div>
<p style="color:#64748b;font-size:12px;">If you did not expect this email, please disregard it.</p>`
        );
        sendNotificationEmail(smtp, form.email, form.full_name, 'Welcome to Family Council - Your Account Details', emailBody, user?.id || null, 'member_created');
      }
    }

    await fetchMembers();
    setShowModal(false);
    setSaving(false);
  }

  async function handleToggleActive() {
    if (!confirmToggle) return;
    await supabase.from('profiles').update({ is_active: !confirmToggle.is_active, updated_at: new Date().toISOString() }).eq('id', confirmToggle.id);
    await logAuditEvent(user?.id || null, confirmToggle.is_active ? 'deactivate_member' : 'activate_member', 'members', confirmToggle.id, 'profile', {});
    setConfirmToggle(null);
    fetchMembers();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    await supabase.from('profiles').delete().eq('id', confirmDelete.id);
    await logAuditEvent(user?.id || null, 'delete_member', 'members', confirmDelete.id, 'profile', { email: confirmDelete.email });
    setConfirmDelete(null);
    fetchMembers();
  }

  const visibleMembers = currentUserIsSuperAdmin
    ? members
    : members.filter((m) => (m.role as Role | undefined)?.name !== 'super_admin');

  const filtered = visibleMembers.filter((m) =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase()) ||
    m.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Members</h2>
            <p className="text-slate-400 text-sm">{visibleMembers.length} total</p>
          </div>
        </div>
        <button onClick={() => { if (!canCreate) { setAccessRequest({ module: 'members', action: 'create' }); return; } openCreate(); }} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg text-sm">
          <Plus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search members..." className="w-full bg-slate-800/50 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm" />
      </div>

      <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 text-blue-400 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3"><Users className="w-12 h-12 text-slate-600" /><p className="text-slate-400">No members found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Member</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Role</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Last Login</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold">
                          {member.full_name?.[0] || member.email?.[0] || 'U'}
                        </div>
                        <div>
                          <p className="text-white text-sm font-medium">{member.full_name || '—'}</p>
                          <p className="text-slate-400 text-xs">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-slate-300 text-sm">{(member.role as Role | undefined)?.display_name || '—'}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${member.is_active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-sm">
                      {member.last_login ? new Date(member.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => { if (!canEdit || (isMemberSuperAdmin(member) && !currentUserIsSuperAdmin)) { setAccessRequest({ module: 'members', action: 'update' }); return; } setConfirmToggle(member); }} title={member.is_active ? 'Deactivate' : 'Activate'} className={`p-1.5 rounded-lg transition-all ${member.is_active ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                          {member.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { if (!canEdit || (isMemberSuperAdmin(member) && !currentUserIsSuperAdmin)) { setAccessRequest({ module: 'members', action: 'update' }); return; } openEdit(member); }} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (!canDelete || (isMemberSuperAdmin(member) && !currentUserIsSuperAdmin)) { setAccessRequest({ module: 'members', action: 'delete' }); return; } setConfirmDelete(member); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Member Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">{editing ? 'Edit Member' : 'Add New Member'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Full Name</label>
                <input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="member@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  {editing ? 'New Password (leave blank to keep current)' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder={editing ? 'Leave blank to keep current' : 'Min 8 characters'}
                    minLength={editing ? 0 : 8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Role</label>
                <select
                  value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">No Role</option>
                  {roles
                    .filter((r) => currentUserIsSuperAdmin || r.name !== 'super_admin')
                    .map((r) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-slate-300 text-sm">Active</span>
              </label>
              {formError && <p className="text-red-400 text-sm">{formError}</p>}
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 text-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Save Changes' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove Member"
        message={`Are you sure you want to remove "${confirmDelete?.full_name || confirmDelete?.email}" from the system? This action cannot be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Toggle Active Confirmation */}
      <ConfirmModal
        open={!!confirmToggle}
        title={confirmToggle?.is_active ? 'Deactivate Member' : 'Activate Member'}
        message={confirmToggle?.is_active
          ? `Deactivate "${confirmToggle?.full_name || confirmToggle?.email}"? They will no longer be able to sign in.`
          : `Activate "${confirmToggle?.full_name || confirmToggle?.email}"? They will be able to sign in again.`
        }
        confirmLabel={confirmToggle?.is_active ? 'Deactivate' : 'Activate'}
        variant={confirmToggle?.is_active ? 'warning' : 'info'}
        onConfirm={handleToggleActive}
        onCancel={() => setConfirmToggle(null)}
      />

      <AccessRequestModal
        open={!!accessRequest}
        module={accessRequest?.module || ''}
        action={accessRequest?.action || ''}
        onClose={() => setAccessRequest(null)}
      />
    </div>
  );
}
