import React, { useEffect, useState } from 'react';
import { Megaphone, Plus, CreditCard as Edit2, Trash2, X, Loader2, Globe, EyeOff } from 'lucide-react';
import { supabase, Announcement } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';
import AccessRequestModal from '../components/AccessRequestModal';

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-500/20 text-slate-300',
  normal: 'bg-blue-500/20 text-blue-300',
  high: 'bg-amber-500/20 text-amber-300',
  urgent: 'bg-red-500/20 text-red-300',
};

export default function AnnouncementsPage() {
  const { user, hasPermission } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', priority: 'normal', is_published: false });
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = hasPermission('announcements', 'create');
  const canEdit = hasPermission('announcements', 'update');
  const canDelete = hasPermission('announcements', 'delete');

  useEffect(() => { fetchAnnouncements(); }, []);

  async function fetchAnnouncements() {
    setLoading(true);
    const { data } = await supabase
      .from('announcements')
      .select('*, creator:profiles(full_name)')
      .order('created_at', { ascending: false });
    setAnnouncements((data as Announcement[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ title: '', content: '', priority: 'normal', is_published: false });
    setShowModal(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setForm({ title: a.title, content: a.content, priority: a.priority, is_published: a.is_published });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');

    // Both branches used to discard the error: the update wrote an audit entry
    // for a change that may never have landed, and the insert silently skipped
    // its audit entry. Either way the modal closed as though it had worked.
    if (editing) {
      const { error } = await supabase
        .from('announcements')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) {
        setSaveError(`Could not save the announcement: ${error.message}`);
        setSaving(false);
        return;
      }
      await logAuditEvent(user?.id || null, 'update', 'announcements', editing.id, 'announcement', { title: form.title });
    } else {
      const { data, error } = await supabase
        .from('announcements')
        .insert({ ...form, created_by: user?.id })
        .select()
        .maybeSingle();
      if (error) {
        setSaveError(`Could not create the announcement: ${error.message}`);
        setSaving(false);
        return;
      }
      if (data) await logAuditEvent(user?.id || null, 'create', 'announcements', data.id, 'announcement', { title: form.title });
    }

    await fetchAnnouncements();
    setShowModal(false);
    setSaving(false);
  }

  function handleDelete(a: Announcement) {
    setConfirmDelete(a);
  }

  async function confirmDeleteAnnouncement() {
    if (!confirmDelete) return;
    setDeleting(true);
    await supabase.from('announcements').delete().eq('id', confirmDelete.id);
    await logAuditEvent(user?.id || null, 'delete', 'announcements', confirmDelete.id, 'announcement', { title: confirmDelete.title });
    setConfirmDelete(null);
    setDeleting(false);
    fetchAnnouncements();
  }

  async function togglePublish(a: Announcement) {
    await supabase.from('announcements').update({ is_published: !a.is_published, updated_at: new Date().toISOString() }).eq('id', a.id);
    await logAuditEvent(user?.id || null, a.is_published ? 'unpublish' : 'publish', 'announcements', a.id, 'announcement', {});
    fetchAnnouncements();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Announcements</h2>
            <p className="text-slate-400 text-sm">{announcements.filter((a) => a.is_published).length} published</p>
          </div>
        </div>
        <button onClick={() => { if (!canCreate) { setAccessRequest({ module: 'announcements', action: 'create' }); return; } openCreate(); }} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg">
          <Plus className="w-4 h-4" />
          New Announcement
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-800/50 border border-white/5 rounded-2xl">
          <Megaphone className="w-12 h-12 text-slate-600" />
          <p className="text-slate-400">No announcements yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => (
            <div key={a.id} className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all group">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium capitalize ${PRIORITY_COLORS[a.priority]}`}>{a.priority}</span>
                    {a.is_published ? (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-1"><Globe className="w-3 h-3" />Published</span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-500/20 text-slate-400 flex items-center gap-1"><EyeOff className="w-3 h-3" />Draft</span>
                    )}
                  </div>
                  <h3 className="text-white font-semibold text-base">{a.title}</h3>
                  <p className="text-slate-400 text-sm mt-1 line-clamp-2">{a.content}</p>
                  <p className="text-slate-500 text-xs mt-2">
                    {new Date(a.created_at).toLocaleDateString()} — {(a.creator as { full_name: string } | undefined)?.full_name || 'Unknown'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { if (!canEdit) { setAccessRequest({ module: 'announcements', action: 'update' }); return; } togglePublish(a); }} title={a.is_published ? 'Unpublish' : 'Publish'} className={`p-1.5 rounded-lg transition-all ${a.is_published ? 'text-slate-400 hover:text-amber-400 hover:bg-amber-500/10' : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10'}`}>
                    {a.is_published ? <EyeOff className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { if (!canEdit) { setAccessRequest({ module: 'announcements', action: 'update' }); return; } openEdit(a); }} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { if (!canDelete) { setAccessRequest({ module: 'announcements', action: 'delete' }); return; } handleDelete(a); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">{editing ? 'Edit Announcement' : 'New Announcement'}</h3>
              <button onClick={() => { setShowModal(false); setSaveError(''); }} aria-label="Close" className="text-slate-400 hover:text-white"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6 space-y-4">
              {saveError && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  <X className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="Announcement title..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Priority</label>
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Content</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={5} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none" placeholder="Announcement content..." />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`w-10 h-6 rounded-full transition-colors relative ${form.is_published ? 'bg-emerald-500' : 'bg-slate-700'}`} onClick={() => setForm({ ...form, is_published: !form.is_published })}>
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_published ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-slate-300 text-sm">Publish immediately</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 text-sm">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Announcement"
        message={`Are you sure you want to delete "${confirmDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDeleteAnnouncement}
        onCancel={() => setConfirmDelete(null)}
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
