import React, { useEffect, useState } from 'react';
import { ClipboardList, Search, Filter, RefreshCw, ChevronLeft, ChevronRight, CheckCircle, AlertCircle, TrendingUp, LogIn, Trash2, CreditCard as Edit2, Plus } from 'lucide-react';
import { supabase, AuditLog } from '../lib/supabase';

const ACTION_ICONS: Record<string, React.ReactNode> = {
  login_success: <LogIn className="w-4 h-4 text-emerald-400" />,
  login_failed: <AlertCircle className="w-4 h-4 text-red-400" />,
  logout: <LogIn className="w-4 h-4 text-slate-400" />,
  create: <Plus className="w-4 h-4 text-blue-400" />,
  update: <Edit2 className="w-4 h-4 text-amber-400" />,
  delete: <Trash2 className="w-4 h-4 text-red-400" />,
  password_changed: <CheckCircle className="w-4 h-4 text-emerald-400" />,
};

const ACTION_COLORS: Record<string, string> = {
  login_success: 'bg-emerald-500/10 text-emerald-300',
  login_failed: 'bg-red-500/10 text-red-300',
  logout: 'bg-slate-500/10 text-slate-300',
  create: 'bg-blue-500/10 text-blue-300',
  update: 'bg-amber-500/10 text-amber-300',
  delete: 'bg-red-500/10 text-red-300',
  password_changed: 'bg-emerald-500/10 text-emerald-300',
};

const PAGE_SIZE = 20;

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterModule, setFilterModule] = useState('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => { fetchLogs(); }, [page, filterModule]);

  async function fetchLogs() {
    setLoading(true);
    let query = supabase
      .from('audit_logs')
      .select('*, user:profiles(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterModule !== 'all') query = query.eq('module', filterModule);

    const { data, count } = await query;
    setLogs((data as AuditLog[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }

  const modules = ['all', 'auth', 'council_records', 'meetings', 'announcements', 'members', 'roles', 'chatbot'];

  const filtered = search
    ? logs.filter((l) =>
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.module.toLowerCase().includes(search.toLowerCase()) ||
        (l.user as { full_name: string; email: string } | undefined)?.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        (l.user as { full_name: string; email: string } | undefined)?.email?.toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-700/50 rounded-xl flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Audit Logs</h2>
            <p className="text-slate-400 text-sm">{total} total events</p>
          </div>
        </div>
        <button onClick={fetchLogs} className="flex items-center gap-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-2 rounded-xl transition-all text-sm">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search logs..." className="w-full bg-slate-800/50 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm" />
        </div>
        <select value={filterModule} onChange={(e) => { setFilterModule(e.target.value); setPage(0); }} className="bg-slate-800/50 border border-white/5 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
          {modules.map((m) => <option key={m} value={m}>{m === 'all' ? 'All Modules' : m}</option>)}
        </select>
      </div>

      <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <ClipboardList className="w-12 h-12 text-slate-600" />
            <p className="text-slate-400">No audit logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-6 py-4">Event</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Module</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">User</th>
                  <th className="text-left text-xs font-medium text-slate-400 uppercase tracking-wider px-4 py-4">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {ACTION_ICONS[log.action] || <TrendingUp className="w-4 h-4 text-slate-400" />}
                        <span className={`text-xs px-2.5 py-1 rounded-full capitalize font-medium ${ACTION_COLORS[log.action] || 'bg-slate-500/10 text-slate-300'}`}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {log.target_id && (
                        <p className="text-slate-600 text-xs mt-1 truncate max-w-xs">{log.target_type}: {log.target_id.slice(0, 20)}...</p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-slate-300 text-sm capitalize">{log.module}</span>
                    </td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-white text-sm">{(log.user as { full_name: string; email: string } | undefined)?.full_name || 'System'}</p>
                        <p className="text-slate-500 text-xs">{(log.user as { full_name: string; email: string } | undefined)?.email || ''}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-sm whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
            <p className="text-slate-400 text-sm">Page {page + 1} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 bg-white/5 hover:bg-white/10 rounded-lg transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-2 text-slate-400 hover:text-white disabled:opacity-30 bg-white/5 hover:bg-white/10 rounded-lg transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
