import React, { useEffect, useState } from 'react';
import { Calendar, Plus, CreditCard as Edit2, Trash2, Eye, X, Loader2, MapPin, Clock } from 'lucide-react';
import { supabase, Meeting } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';
import AccessRequestModal from '../components/AccessRequestModal';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-500/20 text-blue-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  cancelled: 'bg-red-500/20 text-red-300',
  postponed: 'bg-amber-500/20 text-amber-300',
};

const PH_TZ = 'Asia/Manila';

function toPHLocalInput(dateStr: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PH_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(dateStr));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

function formatPHTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-PH', { timeZone: PH_TZ, hour: '2-digit', minute: '2-digit' });
}

function formatPHDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-PH', { timeZone: PH_TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function formatPHMonth(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-PH', { timeZone: PH_TZ, month: 'short' });
}

function getPHDay(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-PH', { timeZone: PH_TZ, day: 'numeric' });
}

function phInputToUTC(localDateStr: string) {
  const utc = new Date(localDateStr + ':00+08:00');
  return utc.toISOString();
}

export default function MeetingsPage() {
  const { user, hasPermission } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [viewMeeting, setViewMeeting] = useState<Meeting | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', meeting_date: '', location: '', status: 'scheduled', notes: '' });
  const [confirmDelete, setConfirmDelete] = useState<Meeting | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = hasPermission('meetings', 'create');
  const canEdit = hasPermission('meetings', 'update');
  const canDelete = hasPermission('meetings', 'delete');

  useEffect(() => { fetchMeetings(); }, []);

  useEffect(() => {
    const channel = supabase
      .channel('meetings-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => {
        fetchMeetings();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchMeetings() {
    setLoading(true);
    const { data } = await supabase
      .from('meetings')
      .select('*, creator:profiles(full_name)')
      .order('meeting_date', { ascending: false });
    setMeetings((data as Meeting[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditingMeeting(null);
    setForm({ title: '', description: '', meeting_date: '', location: '', status: 'scheduled', notes: '' });
    setShowModal(true);
  }

  function openEdit(meeting: Meeting) {
    setEditingMeeting(meeting);
    const localDate = toPHLocalInput(meeting.meeting_date);
    setForm({ title: meeting.title, description: meeting.description, meeting_date: localDate, location: meeting.location, status: meeting.status, notes: meeting.notes });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.title || !form.meeting_date) return;
    setSaving(true);
    setSaveError('');
    const payload = { ...form, meeting_date: phInputToUTC(form.meeting_date) };

    // Both branches used to discard the error: the update wrote an audit entry
    // for a change that may never have landed, and the insert silently skipped
    // its audit entry. Either way the modal closed as though it had worked.
    if (editingMeeting) {
      const { error } = await supabase
        .from('meetings')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingMeeting.id);
      if (error) {
        setSaveError(`Could not save the meeting: ${error.message}`);
        setSaving(false);
        return;
      }
      await logAuditEvent(user?.id || null, 'update', 'meetings', editingMeeting.id, 'meeting', { title: form.title });
    } else {
      const { data, error } = await supabase
        .from('meetings')
        .insert({ ...payload, created_by: user?.id })
        .select()
        .maybeSingle();
      if (error) {
        setSaveError(`Could not create the meeting: ${error.message}`);
        setSaving(false);
        return;
      }
      if (data) await logAuditEvent(user?.id || null, 'create', 'meetings', data.id, 'meeting', { title: form.title });
    }

    await fetchMeetings();
    setShowModal(false);
    setSaving(false);
  }

  function handleDelete(meeting: Meeting) {
    setConfirmDelete(meeting);
  }

  async function confirmDeleteMeeting() {
    if (!confirmDelete) return;
    setDeleting(true);
    await supabase.from('meetings').delete().eq('id', confirmDelete.id);
    await logAuditEvent(user?.id || null, 'delete', 'meetings', confirmDelete.id, 'meeting', { title: confirmDelete.title });
    setConfirmDelete(null);
    setDeleting(false);
    fetchMeetings();
  }

  const upcoming = meetings.filter((m) => new Date(m.meeting_date) >= new Date() && m.status === 'scheduled');
  const past = meetings.filter((m) => new Date(m.meeting_date) < new Date() || m.status !== 'scheduled');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
            <Calendar className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Meetings</h2>
            <p className="text-slate-400 text-sm">{upcoming.length} upcoming</p>
          </div>
        </div>
        <button onClick={() => { if (!canCreate) { setAccessRequest({ module: 'meetings', action: 'create' }); return; } openCreate(); }} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg">
          <Plus className="w-4 h-4" />
          New Meeting
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div>
              <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-3">Upcoming</h3>
              <div className="grid gap-4">
                {upcoming.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} onView={setViewMeeting} onEdit={(m) => { if (!canEdit) { setAccessRequest({ module: 'meetings', action: 'update' }); return; } openEdit(m); }} onDelete={(m) => { if (!canDelete) { setAccessRequest({ module: 'meetings', action: 'delete' }); return; } handleDelete(m); }} />
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <div>
              <h3 className="text-slate-400 text-sm font-medium uppercase tracking-wider mb-3">Past & Other</h3>
              <div className="grid gap-4">
                {past.map((meeting) => (
                  <MeetingCard key={meeting.id} meeting={meeting} onView={setViewMeeting} onEdit={(m) => { if (!canEdit) { setAccessRequest({ module: 'meetings', action: 'update' }); return; } openEdit(m); }} onDelete={(m) => { if (!canDelete) { setAccessRequest({ module: 'meetings', action: 'delete' }); return; } handleDelete(m); }} />
                ))}
              </div>
            </div>
          )}

          {meetings.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-800/50 border border-white/5 rounded-2xl">
              <Calendar className="w-12 h-12 text-slate-600" />
              <p className="text-slate-400">No meetings found</p>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">{editingMeeting ? 'Edit Meeting' : 'New Meeting'}</h3>
              <button onClick={() => { setShowModal(false); setSaveError(''); }} aria-label="Close" className="text-slate-400 hover:text-white"><X className="w-5 h-5" aria-hidden="true" /></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {saveError && (
                <div role="alert" className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                  <X className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="Meeting title..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Date & Time</label>
                  <input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50">
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="postponed">Postponed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Location</label>
                <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" placeholder="Meeting location..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none" placeholder="Meeting description..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none" placeholder="Meeting notes..." />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.meeting_date} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 text-sm">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingMeeting ? 'Save Changes' : 'Create Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Modal */}
      {viewMeeting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <div>
                <h3 className="text-white font-semibold text-lg">{viewMeeting.title}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[viewMeeting.status]}`}>{viewMeeting.status}</span>
              </div>
              <button onClick={() => setViewMeeting(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-300 text-sm"><Clock className="w-4 h-4 text-blue-400" />{formatPHDateTime(viewMeeting.meeting_date)}</div>
              {viewMeeting.location && <div className="flex items-center gap-2 text-slate-300 text-sm"><MapPin className="w-4 h-4 text-emerald-400" />{viewMeeting.location}</div>}
              {viewMeeting.description && <p className="text-slate-300 text-sm">{viewMeeting.description}</p>}
              {viewMeeting.notes && (
                <div className="bg-white/5 rounded-xl p-4">
                  <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">Notes</p>
                  <p className="text-slate-300 text-sm whitespace-pre-wrap">{viewMeeting.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="Delete Meeting"
        message={`Are you sure you want to delete "${confirmDelete?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleting}
        onConfirm={confirmDeleteMeeting}
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

function MeetingCard({ meeting, onView, onEdit, onDelete }: {
  meeting: Meeting;
  onView: (m: Meeting) => void;
  onEdit: (m: Meeting) => void;
  onDelete: (m: Meeting) => void;
}) {
  const isUpcoming = new Date(meeting.meeting_date) >= new Date();
  return (
    <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all group flex gap-4">
      <div className={`w-14 h-14 rounded-xl flex-shrink-0 flex flex-col items-center justify-center ${isUpcoming ? 'bg-emerald-500/20' : 'bg-slate-700/50'}`}>
        <span className={`text-lg font-bold ${isUpcoming ? 'text-emerald-400' : 'text-slate-400'}`}>
          {getPHDay(meeting.meeting_date)}
        </span>
        <span className={`text-xs ${isUpcoming ? 'text-emerald-400' : 'text-slate-500'}`}>
          {formatPHMonth(meeting.meeting_date)}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-white font-medium">{meeting.title}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-slate-400 text-xs flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatPHTime(meeting.meeting_date)}
              </span>
              {meeting.location && (
                <span className="text-slate-400 text-xs flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {meeting.location}
                </span>
              )}
            </div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${STATUS_COLORS[meeting.status] || ''}`}>{meeting.status}</span>
        </div>
        {meeting.description && <p className="text-slate-400 text-xs mt-2 truncate">{meeting.description}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <button onClick={() => onView(meeting)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"><Eye className="w-4 h-4" /></button>
        <button onClick={() => onEdit(meeting)} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => onDelete(meeting)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
