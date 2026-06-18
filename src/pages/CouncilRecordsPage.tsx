import React, { useEffect, useState } from 'react';
import { FileText, Plus, Search, Filter, CreditCard as Edit2, Trash2, Eye, X, Loader2, AlertCircle } from 'lucide-react';
import { supabase, CouncilRecord } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';
import AccessRequestModal from '../components/AccessRequestModal';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-500/20 text-slate-300',
  published: 'bg-emerald-500/20 text-emerald-300',
  archived: 'bg-amber-500/20 text-amber-300',
};

const TYPE_LABELS: Record<string, string> = {
  general: 'General',
  resolution: 'Resolution',
  minutes: 'Minutes',
  report: 'Report',
  policy: 'Policy',
};

export default function CouncilRecordsPage() {
  const { user, hasPermission } = useAuth();
  const [records, setRecords] = useState<CouncilRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CouncilRecord | null>(null);
  const [viewRecord, setViewRecord] = useState<CouncilRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', record_type: 'general', status: 'draft' });
  const [confirmDelete, setConfirmDelete] = useState<CouncilRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = hasPermission('council_records', 'create');
  const canEdit = hasPermission('council_records', 'update');
  const canDelete = hasPermission('council_records', 'delete');

  useEffect(() => { fetchRecords(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('council-records-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'council_records' }, () => {
        fetchRecords();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchRecords() {
    setLoading(true);
    const { data } = await supabase
      .from('council_records')
      .select('*, creator:profiles(full_name, email)')
      .order('created_at', { ascending: false });
    setRecords((data as CouncilRecord[]) || []);
    setLoading(false);
  }

  const filtered = records.filter((r) => {
    const matchSearch = r.title.toLowerCase().includes(search.toLowerCase()) || r.content.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  function openCreate() {
    setEditingRecord(null);
    setForm({ title: '', content: '', record_type: 'general', status: 'draft' });
    setShowModal(true);
  }

  function openEdit(record: CouncilRecord) {
    setEditingRecord(record);
    setForm({ title: record.title, content: record.content, record_type: record.record_type, status: record.status });
    setShowModal(true);
  }

  async function handleSave() {
    setSaving(true);
    if (editingRecord) {
      await supabase.from('council_records').update({ ...form, updated_by: user?.id, updated_at: new Date().toISOString() }).eq('id', editingRecord.id);
      await logAuditEvent(user?.id || null, 'update', 'council_records', editingRecord.id, 'council_record', { title: form.title });
    } else {
      const { data } = await supabase.from('council_records').insert({ ...form, created_by: user?.id }).select().maybeSingle();
      if (data) await logAuditEvent(user?.id || null, 'create', 'council_records', data.id, 'council_record', { title: form.title });
    }
    await fetchRecords();
    setShowModal(false);
    setSaving(false);
  }

  function handleDelete(record: CouncilRecord) {
    setConfirmDelete(record);
  }

  async function confirmDeleteRecord() {
    if (!confirmDelete) return;
    setDeleting(true);
    await supabase.from('council_records').delete().eq('id', confirmDelete.id);
    await logAuditEvent(user?.id || null, 'delete', 'council_records', confirmDelete.id, 'council_record', { title: confirmDelete.title });
    setConfirmDelete(null);
    setDeleting(false);
    fetchRecords();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Council Records</h2>
            <p className="text-slate-400 text-sm">{records.length} total records</p>
          </div>
        </div>
        <button onClick={() => { if (!canCreate) { setAccessRequest({ module: 'council_records', action: 'create' }); return; } openCreate(); }} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20">
          <Plus className="w-4 h-4" />
          New Record
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search records..."
            className="w-full bg-slate-800/50 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-slate-800/50 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="w-12 h-12 text-slate-600" />
            <p className="text-slate-400">No records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Title</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Type</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Created</th>
                  <th className="text-right text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((record) => (
                  <tr key={record.id} className="hover:bg-white/2 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-white font-medium text-sm">{record.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5 truncate max-w-xs">{record.content.slice(0, 80)}{record.content.length > 80 ? '...' : ''}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-slate-300 text-sm">{TYPE_LABELS[record.record_type] || record.record_type}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${STATUS_COLORS[record.status] || 'bg-slate-500/20 text-slate-300'}`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-sm">
                      {new Date(record.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setViewRecord(record)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (!canEdit) { setAccessRequest({ module: 'council_records', action: 'update' }); return; } openEdit(record); }} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => { if (!canDelete) { setAccessRequest({ module: 'council_records', action: 'delete' }); return; } handleDelete(record); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">{editingRecord ? 'Edit Record' : 'New Record'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="Record title..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Type</label>
                  <select
                    value={form.record_type}
                    onChange={(e) => setForm({ ...form, record_type: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={6}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none"
                  placeholder="Record content..."
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {editingRecord ? 'Save Changes' : 'Create Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h3 className="text-white font-semibold text-lg">{viewRecord.title}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[viewRecord.status]}`}>{viewRecord.status}</span>
                  <span className="text-slate-500 text-xs">{TYPE_LABELS[viewRecord.record_type]}</span>
                </div>
              </div>
              <button onClick={() => setViewRecord(null)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">{viewRecord.content || 'No content'}</p>
              <p className="text-slate-500 text-xs mt-4">Created {new Date(viewRecord.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Record"
        message={`Are you sure you want to delete "${confirmDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDeleteRecord}
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
