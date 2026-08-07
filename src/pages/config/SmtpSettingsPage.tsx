import React, { useEffect, useState } from 'react';
import {
  Mail, Save, Loader2, CheckCircle, XCircle, Eye, EyeOff,
  Send, RefreshCw, Shield, Server, Clock, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent } from '../../lib/audit';

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
  last_tested_at: string | null;
  last_test_status: string;
  created_at: string;
  updated_at: string;
}

const SMTP_SERVICE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smtp-service`;

const ENCRYPTION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'ssl', label: 'SSL' },
  { value: 'tls', label: 'TLS' },
];

export default function SmtpSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    sender_email: '',
    sender_name: 'Family Council System',
    encryption: 'tls',
    is_active: true,
  });

  const [lastTested, setLastTested] = useState<string | null>(null);
  const [lastTestStatus, setLastTestStatus] = useState<string>('untested');

  useEffect(() => { fetchSettings(); }, []);

  async function fetchSettings() {
    setLoading(true);
    const { data } = await supabase
      .from('smtp_settings')
      .select('*')
      .order('created_at')
      .limit(1)
      .maybeSingle();

    if (data) {
      const config = data as SmtpConfig;
      setExistingId(config.id);
      setForm({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        sender_email: config.sender_email,
        sender_name: config.sender_name,
        encryption: config.encryption,
        is_active: config.is_active,
      });
      setLastTested(config.last_tested_at);
      setLastTestStatus(config.last_test_status);
    }
    setLoading(false);
  }

  async function handleTestConnection() {
    if (!form.host || !form.port || !form.sender_email) {
      setTestResult({ success: false, message: 'Please fill in host, port, and sender email before testing.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    // The function authenticates the caller now, so it needs the user's token
    // rather than the anon key. Sending the form's own values (not the saved
    // row) is intentional: an admin has to be able to test before saving.
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    if (!accessToken) {
      setTestResult({ success: false, message: 'Session expired. Please reload and try again.' });
      setTesting(false);
      return;
    }

    try {
      const res = await fetch(SMTP_SERVICE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          action: 'test',
          smtp: {
            host: form.host,
            port: form.port,
            username: form.username,
            password: form.password,
            sender_email: form.sender_email,
            sender_name: form.sender_name,
            encryption: form.encryption,
          },
        }),
        signal: AbortSignal.timeout(60000),
      });

      const result = await res.json();
      setTestResult(result);

      const status = result.success ? 'connected' : 'failed';
      setLastTestStatus(status);
      setLastTested(new Date().toISOString());

      if (existingId) {
        await supabase.from('smtp_settings').update({
          last_tested_at: new Date().toISOString(),
          last_test_status: status,
        }).eq('id', existingId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection test failed';
      setTestResult({ success: false, message: msg });
    }

    setTesting(false);
  }

  async function handleSave() {
    if (!form.host || !form.sender_email) {
      setTestResult({ success: false, message: 'Host and Sender Email are required.' });
      return;
    }

    setSaving(true);
    setSaveSuccess(false);

    if (existingId) {
      await supabase.from('smtp_settings').update({
        ...form,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }).eq('id', existingId);
      await logAuditEvent(user?.id || null, 'update_smtp_settings', 'configuration', existingId, 'smtp_settings', { host: form.host, sender_email: form.sender_email });
    } else {
      const { data } = await supabase.from('smtp_settings').insert({
        ...form,
        created_by: user?.id,
      }).select().maybeSingle();
      if (data) {
        setExistingId(data.id);
        await logAuditEvent(user?.id || null, 'create_smtp_settings', 'configuration', data.id, 'smtp_settings', { host: form.host, sender_email: form.sender_email });
      }
    }

    setSaveSuccess(true);
    setSaving(false);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Mail className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">SMTP Settings</h2>
            <p className="text-slate-400 text-sm">Configure email delivery for system notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastTestStatus !== 'untested' && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${
              lastTestStatus === 'connected'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                : 'bg-red-500/10 border border-red-500/20 text-red-300'
            }`}>
              {lastTestStatus === 'connected' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {lastTestStatus === 'connected' ? 'Connected' : 'Failed'}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Server Settings */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-4 h-4 text-blue-400" />
              <h3 className="text-white font-semibold text-sm">Server Configuration</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1.5">SMTP Host</label>
                <input
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-mono"
                  placeholder="smtp.gmail.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Port</label>
                <input
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="587"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Encryption Type</label>
                <select
                  value={form.encryption}
                  onChange={(e) => setForm({ ...form, encryption: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {ENCRYPTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Authentication */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-white font-semibold text-sm">Authentication</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="your-email@gmail.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                    placeholder="App password or SMTP password"
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
            </div>
          </div>

          {/* Sender Settings */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Send className="w-4 h-4 text-amber-400" />
              <h3 className="text-white font-semibold text-sm">Sender Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Sender Email Address</label>
                <input
                  type="email"
                  value={form.sender_email}
                  onChange={(e) => setForm({ ...form, sender_email: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="noreply@yourdomain.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Sender Display Name</label>
                <input
                  value={form.sender_name}
                  onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="Family Council System"
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={handleTestConnection}
              disabled={testing || !form.host || !form.sender_email}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl transition-all text-sm font-medium disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Test Connection
            </button>

            <button
              onClick={handleSave}
              disabled={saving || !form.host || !form.sender_email}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-6 py-2.5 rounded-xl transition-all shadow-lg text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saveSuccess ? 'Saved' : 'Save Settings'}
            </button>
          </div>

          {/* Test Result */}
          {testResult && (
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/20'
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              {testResult.success
                ? <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                : <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              }
              <div>
                <p className={`text-sm font-medium ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                  {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                </p>
                <div className={`text-xs mt-1 space-y-1 ${testResult.success ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
                  {testResult.message.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side Info */}
        <div className="space-y-4">
          {/* Status Card */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 space-y-4">
            <h3 className="text-white font-semibold text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              Connection Status
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Status</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  lastTestStatus === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : lastTestStatus === 'failed'
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-slate-500/20 text-slate-400'
                }`}>
                  {lastTestStatus === 'connected' ? 'Connected' : lastTestStatus === 'failed' ? 'Failed' : 'Not Tested'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Last Tested</span>
                <span className="text-slate-300 text-xs">
                  {lastTested ? new Date(lastTested).toLocaleString() : 'Never'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Encryption</span>
                <span className="text-slate-300 text-xs uppercase">{form.encryption || 'TLS'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Port</span>
                <span className="text-slate-300 text-xs">{form.port}</span>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-400" />
              <h3 className="text-blue-300 font-medium text-sm">Setup Guide</h3>
            </div>
            <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
              <p>Common SMTP configurations:</p>
              <div className="space-y-1.5">
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-slate-300 font-medium">Gmail</p>
                  <p className="text-slate-500 font-mono text-[11px]">smtp.gmail.com : 587 (TLS)</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-slate-300 font-medium">Outlook / Office 365</p>
                  <p className="text-slate-500 font-mono text-[11px]">smtp.office365.com : 587 (TLS)</p>
                </div>
                <div className="bg-white/5 rounded-lg p-2">
                  <p className="text-slate-300 font-medium">Custom SMTP</p>
                  <p className="text-slate-500 font-mono text-[11px]">your-host.com : 465 (SSL)</p>
                </div>
              </div>
              <p className="text-slate-500 mt-2">
                For Gmail, use an App Password instead of your regular password.
              </p>
            </div>
          </div>

          {/* Active Toggle */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <p className="text-white text-sm font-medium">Email Notifications</p>
                <p className="text-slate-500 text-xs mt-0.5">Enable system email delivery</p>
              </div>
              <div
                className={`w-11 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`}
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-6' : 'left-1'}`} />
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
