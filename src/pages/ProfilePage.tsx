import React, { useState } from 'react';
import { User, Mail, AtSign, Save, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function ProfilePage() {
  const { user, profile, role, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    username: profile?.username || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', user!.id);
    if (err) {
      setError(err.message);
    } else {
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
          <User className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">My Profile</h2>
          <p className="text-slate-400 text-sm">Manage your account information</p>
        </div>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4 p-5 bg-slate-800/50 border border-white/5 rounded-2xl">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
          {form.full_name?.[0] || form.username?.[0] || user?.email?.[0] || 'U'}
        </div>
        <div>
          <p className="text-white font-semibold text-lg">{form.full_name || form.username || 'User'}</p>
          <p className="text-slate-400 text-sm">{user?.email}</p>
          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full mt-1 inline-block">{role?.display_name || 'Member'}</span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="bg-slate-800/50 border border-white/5 rounded-2xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Full Name
          </label>
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            placeholder="Your full name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5" />
            Username
          </label>
          <input
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            placeholder="Username (used for login)"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" />
            Email
          </label>
          <input
            value={user?.email || ''}
            disabled
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-slate-400 text-sm cursor-not-allowed"
          />
          <p className="text-slate-500 text-xs mt-1">Email cannot be changed here</p>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              Saved!
            </span>
          )}
        </div>
      </form>

      {/* Info */}
      <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-medium text-sm">Account Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Member since</span><span className="text-slate-300">{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Last login</span><span className="text-slate-300">{profile?.last_login ? new Date(profile.last_login).toLocaleString() : 'Never'}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Account status</span><span className={profile?.is_active ? 'text-emerald-400' : 'text-red-400'}>{profile?.is_active ? 'Active' : 'Inactive'}</span></div>
        </div>
      </div>
    </div>
  );
}
