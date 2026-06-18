import React, { useEffect, useState, useRef } from 'react';
import {
  Webhook, Save, Loader2, CheckCircle, XCircle, RefreshCw, AlertCircle,
  Plus, Trash2, CreditCard as Edit2, X, Send, ChevronDown, ChevronUp,
  Clock, Code, Activity, Info, Zap, AlertOctagon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent } from '../../lib/audit';
import ConfirmModal from '../../components/ConfirmModal';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  last_tested_at: string | null;
  last_status: string;
  last_status_message: string;
  headers: Record<string, string>;
  created_at: string;
  updated_at: string;
}

interface TestResult {
  timestamp: string;
  success: boolean;
  statusCode?: number;
  latencyMs: number;
  responseRaw: string;
  responseParsed: Record<string, unknown> | null;
  errorMessage?: string;
  mappedFields: Record<string, string>;
}

interface WebhookInteraction {
  id: string;
  webhook_config_id: string;
  session_id: string;
  direction: string;
  request_payload: Record<string, unknown>;
  response_status: number;
  response_body: string;
  latency_ms: number;
  success: boolean;
  error_message: string;
  created_at: string;
}

const STATUS_MAP = {
  connected: { label: 'Connected', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', dot: 'bg-emerald-400' },
  disconnected: { label: 'Disconnected', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' },
  error: { label: 'Error', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', dot: 'bg-amber-400' },
  unknown: { label: 'Not Tested', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', dot: 'bg-slate-500' },
};

const RESPONSE_FIELD_CANDIDATES = ['reply', 'message', 'text', 'response', 'content', 'output', 'data', 'body', 'result', 'answer'];

function extractReplyText(parsed: Record<string, unknown>): string | null {
  for (const key of RESPONSE_FIELD_CANDIDATES) {
    const val = parsed[key];
    if (typeof val === 'string' && val.trim()) return val;
    if (typeof val === 'object' && val !== null) {
      const nested = val as Record<string, unknown>;
      for (const nk of RESPONSE_FIELD_CANDIDATES) {
        if (typeof nested[nk] === 'string') return nested[nk] as string;
      }
    }
  }
  return null;
}

function buildMappedFields(parsed: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  const flatten = (obj: Record<string, unknown>, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        flatten(v as Record<string, unknown>, path);
      } else {
        result[path] = String(v);
      }
    }
  };
  flatten(parsed);
  return result;
}

export default function ChatbotSetupPage() {
  const { user } = useAuth();
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<WebhookConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', is_active: true });
  const [confirmDeleteWh, setConfirmDeleteWh] = useState<WebhookConfig | null>(null);

  const [expandedWebhook, setExpandedWebhook] = useState<string | null>(null);
  const [testPayload, setTestPayload] = useState<Record<string, string>>({
    type: 'test',
    source: 'family_council_system',
    message: 'Hello from Family Council',
  });
  const [testResults, setTestResults] = useState<Record<string, TestResult[]>>({});
  const [sendingTest, setSendingTest] = useState<string | null>(null);

  const [recentInteractions, setRecentInteractions] = useState<WebhookInteraction[]>([]);
  const [activityLog, setActivityLog] = useState<{ ts: string; action: string; detail: string }[]>([]);
  const activityRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchWebhooks(); fetchRecentInteractions(); }, []);

  function pushActivity(action: string, detail: string) {
    setActivityLog((prev) => [{ ts: new Date().toISOString(), action, detail }, ...prev.slice(0, 49)]);
  }

  async function fetchWebhooks() {
    setLoading(true);
    const { data } = await supabase.from('webhook_configs').select('*').order('created_at');
    setWebhooks(data || []);
    setLoading(false);
  }

  async function fetchRecentInteractions() {
    const { data } = await supabase
      .from('webhook_interactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentInteractions(data || []);
  }

  async function logInteraction(
    webhookId: string,
    sessionId: string,
    direction: string,
    payload: Record<string, unknown>,
    responseStatus: number,
    responseBody: string,
    latencyMs: number,
    success: boolean,
    errorMessage: string,
  ) {
    await supabase.from('webhook_interactions').insert({
      webhook_config_id: webhookId,
      session_id: sessionId,
      direction,
      request_payload: payload,
      response_status: responseStatus,
      response_body: responseBody.slice(0, 5000),
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
      triggered_by: user?.id || null,
    });
    fetchRecentInteractions();
  }

  const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-proxy`;

  async function sendWebhookRequest(
    webhook: WebhookConfig,
    payload: Record<string, unknown>,
    timeoutMs = 10000,
  ): Promise<TestResult> {
    const start = Date.now();
    const ts = new Date().toISOString();

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          url: webhook.url,
          payload,
          timeout: timeoutMs,
        }),
        signal: AbortSignal.timeout(timeoutMs + 5000),
      });

      const latencyMs = Date.now() - start;
      const proxyResponse = await res.json();

      if (!res.ok || proxyResponse.error) {
        const errorMsg = proxyResponse.error || `Proxy error: HTTP ${res.status}`;
        await logInteraction(webhook.id, '', 'outbound', payload, res.status, proxyResponse.error || '', latencyMs, false, errorMsg);
        return {
          timestamp: ts,
          success: false,
          latencyMs,
          responseRaw: proxyResponse.error || '',
          responseParsed: null,
          mappedFields: {},
          errorMessage: errorMsg,
        };
      }

      const raw = proxyResponse.body || '';
      const actualLatency = proxyResponse.latencyMs || latencyMs;
      let parsed: Record<string, unknown> | null = null;
      try { parsed = JSON.parse(raw); } catch { /* not JSON */ }

      const mappedFields = parsed ? buildMappedFields(parsed) : {};
      const success = proxyResponse.status >= 200 && proxyResponse.status < 300;

      await logInteraction(
        webhook.id, '', 'outbound', payload,
        proxyResponse.status, raw, actualLatency, success,
        !success ? `HTTP ${proxyResponse.status} ${proxyResponse.statusText}` : '',
      );

      return {
        timestamp: ts,
        success,
        statusCode: proxyResponse.status,
        latencyMs: actualLatency,
        responseRaw: raw,
        responseParsed: parsed,
        mappedFields,
        errorMessage: !success ? `HTTP ${proxyResponse.status} ${proxyResponse.statusText}` : undefined,
      };
    } catch (err) {
      const latencyMs = Date.now() - start;
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      const message = isTimeout
        ? `Webhook unreachable - request timed out after ${timeoutMs / 1000}s. Check that your n8n instance is running and the webhook URL is correct.`
        : err instanceof Error ? err.message : 'Network error';

      await logInteraction(webhook.id, '', 'outbound', payload, 0, '', latencyMs, false, message);

      return {
        timestamp: ts,
        success: false,
        latencyMs,
        responseRaw: '',
        responseParsed: null,
        mappedFields: {},
        errorMessage: message,
      };
    }
  }

  async function testConnection(webhook: WebhookConfig) {
    setTesting(webhook.id);
    pushActivity('test_connection', `Testing "${webhook.name}"...`);

    const result = await sendWebhookRequest(webhook, {
      type: 'ping',
      source: 'family_council_system',
      timestamp: new Date().toISOString(),
    });

    const status = result.success ? 'connected' : 'error';
    const message = result.errorMessage || `HTTP ${result.statusCode} - ${result.latencyMs}ms`;

    await supabase.from('webhook_configs').update({
      last_tested_at: new Date().toISOString(),
      last_status: status,
      last_status_message: message,
      updated_at: new Date().toISOString(),
    }).eq('id', webhook.id);

    await logAuditEvent(user?.id || null, 'test_webhook', 'configuration', webhook.id, 'webhook_config', {
      name: webhook.name, status, message,
      response_preview: result.responseRaw.slice(0, 200),
    });

    pushActivity(
      result.success ? 'connected' : 'error',
      result.success
        ? `"${webhook.name}" responded in ${result.latencyMs}ms`
        : `"${webhook.name}" failed: ${result.errorMessage}`,
    );

    await fetchWebhooks();
    setTesting(null);
  }

  async function sendTestMessage(webhook: WebhookConfig) {
    setSendingTest(webhook.id);
    pushActivity('send_test', `Sending test message to "${webhook.name}"...`);

    const result = await sendWebhookRequest(webhook, {
      ...testPayload,
      timestamp: new Date().toISOString(),
    });

    setTestResults((prev) => ({
      ...prev,
      [webhook.id]: [result, ...(prev[webhook.id] || []).slice(0, 9)],
    }));

    await logAuditEvent(user?.id || null, 'webhook_test_message', 'configuration', webhook.id, 'webhook_config', {
      name: webhook.name,
      payload: testPayload,
      response_status: result.statusCode,
      response_preview: result.responseRaw.slice(0, 500),
      latency_ms: result.latencyMs,
      success: result.success,
    });

    if (result.success) {
      const reply = result.responseParsed ? extractReplyText(result.responseParsed) : null;
      pushActivity('response_received', reply ? `Reply: "${reply}"` : `Response received (${result.latencyMs}ms)`);
    } else {
      pushActivity('send_failed', `Send failed: ${result.errorMessage}`);
    }

    setSendingTest(null);
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', url: '', is_active: true });
    setShowModal(true);
  }

  function openEdit(wh: WebhookConfig) {
    setEditing(wh);
    setForm({ name: wh.name, url: wh.url, is_active: wh.is_active });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name || !form.url) return;
    setSaving(true);

    if (editing) {
      await supabase.from('webhook_configs').update({
        ...form, updated_by: user?.id, updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
      await logAuditEvent(user?.id || null, 'update_webhook', 'configuration', editing.id, 'webhook_config', { name: form.name });
      pushActivity('update', `Updated webhook "${form.name}"`);
    } else {
      const { data } = await supabase.from('webhook_configs').insert({
        ...form, created_by: user?.id,
      }).select().maybeSingle();
      if (data) {
        await logAuditEvent(user?.id || null, 'create_webhook', 'configuration', data.id, 'webhook_config', { name: form.name });
        pushActivity('create', `Created webhook "${form.name}"`);
      }
    }
    await fetchWebhooks();
    setShowModal(false);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmDeleteWh) return;
    await supabase.from('webhook_configs').delete().eq('id', confirmDeleteWh.id);
    await logAuditEvent(user?.id || null, 'delete_webhook', 'configuration', confirmDeleteWh.id, 'webhook_config', { name: confirmDeleteWh.name });
    pushActivity('delete', `Deleted webhook "${confirmDeleteWh.name}"`);
    setConfirmDeleteWh(null);
    fetchWebhooks();
  }

  async function toggleActive(wh: WebhookConfig) {
    await supabase.from('webhook_configs').update({ is_active: !wh.is_active, updated_at: new Date().toISOString() }).eq('id', wh.id);
    await logAuditEvent(user?.id || null, wh.is_active ? 'disable_webhook' : 'enable_webhook', 'configuration', wh.id, 'webhook_config', {});
    pushActivity(wh.is_active ? 'disabled' : 'enabled', `"${wh.name}" ${wh.is_active ? 'disabled' : 'enabled'}`);
    fetchWebhooks();
  }

  function updateTestPayloadField(key: string, value: string) {
    setTestPayload((prev) => ({ ...prev, [key]: value }));
  }

  function addTestPayloadField() {
    setTestPayload((prev) => ({ ...prev, [`field_${Object.keys(prev).length}`]: '' }));
  }

  function removeTestPayloadField(key: string) {
    setTestPayload((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const activityColors: Record<string, string> = {
    connected: 'text-emerald-400',
    create: 'text-blue-400',
    update: 'text-amber-400',
    delete: 'text-red-400',
    enabled: 'text-emerald-400',
    disabled: 'text-slate-400',
    error: 'text-red-400',
    send_failed: 'text-red-400',
    response_received: 'text-emerald-400',
    send_test: 'text-blue-400',
    test_connection: 'text-slate-300',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
            <Webhook className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Chatbot Setup</h2>
            <p className="text-slate-400 text-sm">Connect directly to your self-hosted n8n webhook</p>
          </div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-medium px-4 py-2.5 rounded-xl transition-all shadow-lg text-sm">
          <Plus className="w-4 h-4" />
          Add Webhook
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left - Webhook List */}
        <div className="xl:col-span-2 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
          ) : webhooks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 bg-slate-800/50 border border-white/5 rounded-2xl">
              <Webhook className="w-12 h-12 text-slate-600" />
              <p className="text-slate-400">No webhooks configured</p>
              <p className="text-slate-500 text-sm">Add your n8n webhook URL to get started</p>
              <button onClick={openCreate} className="text-blue-400 hover:text-blue-300 text-sm transition-colors mt-2">
                Add your first webhook
              </button>
            </div>
          ) : (
            webhooks.map((wh) => {
              const statusInfo = STATUS_MAP[wh.last_status as keyof typeof STATUS_MAP] || STATUS_MAP.unknown;
              const isExpanded = expandedWebhook === wh.id;
              const results = testResults[wh.id] || [];
              const latestResult = results[0];

              return (
                <div key={wh.id} className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden transition-all hover:border-white/10">
                  {/* Card Header */}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${statusInfo.dot} ${testing === wh.id ? 'animate-pulse' : ''}`} />
                            <h3 className="text-white font-semibold">{wh.name}</h3>
                          </div>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border ${statusInfo.bg} ${statusInfo.color}`}>
                            {testing === wh.id ? 'Testing...' : statusInfo.label}
                          </span>
                          <span className={`text-xs px-2.5 py-0.5 rounded-full ${wh.is_active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-500/10 text-slate-400'}`}>
                            {wh.is_active ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs font-mono truncate">{wh.url}</p>
                        {wh.last_tested_at && (
                          <p className="text-slate-500 text-xs mt-1">
                            Last tested: {new Date(wh.last_tested_at).toLocaleString()}
                            {wh.last_status_message ? ` - ${wh.last_status_message}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => testConnection(wh)}
                          disabled={testing === wh.id}
                          title="Ping webhook"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-lg transition-all text-xs disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${testing === wh.id ? 'animate-spin' : ''}`} />
                          Ping
                        </button>
                        <button
                          onClick={() => setExpandedWebhook(isExpanded ? null : wh.id)}
                          title="Send test message"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 hover:text-blue-200 rounded-lg transition-all text-xs"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Test
                          {isExpanded ? <ChevronUp className="w-3 h-3 ml-0.5" /> : <ChevronDown className="w-3 h-3 ml-0.5" />}
                        </button>
                        <button onClick={() => toggleActive(wh)} title={wh.is_active ? 'Disable' : 'Enable'} className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-all">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(wh)} title="Edit" className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteWh(wh)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expandable Test Panel */}
                  {isExpanded && (
                    <div className="border-t border-white/5 bg-slate-900/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/5">
                        {/* Left: Payload Editor */}
                        <div className="p-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="text-white text-sm font-medium flex items-center gap-2">
                              <Code className="w-4 h-4 text-blue-400" />
                              Request Payload
                            </h4>
                            <button onClick={addTestPayloadField} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                              + Add field
                            </button>
                          </div>
                          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {Object.entries(testPayload).map(([key, value]) => (
                              <div key={key} className="flex gap-2 items-center">
                                <input
                                  value={key}
                                  onChange={(e) => {
                                    const newKey = e.target.value;
                                    setTestPayload((prev) => {
                                      const next: Record<string, string> = {};
                                      for (const [k, v] of Object.entries(prev)) {
                                        next[k === key ? newKey : k] = v;
                                      }
                                      return next;
                                    });
                                  }}
                                  className="w-1/3 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50 font-mono"
                                  placeholder="key"
                                />
                                <input
                                  value={value}
                                  onChange={(e) => updateTestPayloadField(key, e.target.value)}
                                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                                  placeholder="value"
                                />
                                <button onClick={() => removeTestPayloadField(key)} className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => sendTestMessage(wh)}
                            disabled={sendingTest === wh.id || !wh.is_active}
                            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-all text-sm"
                          >
                            {sendingTest === wh.id
                              ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                              : <><Send className="w-4 h-4" /> Send Test Message</>
                            }
                          </button>
                          {!wh.is_active && (
                            <p className="text-amber-400 text-xs text-center">Enable webhook to send messages</p>
                          )}
                        </div>

                        {/* Right: Response Viewer */}
                        <div className="p-5 space-y-4">
                          <h4 className="text-white text-sm font-medium flex items-center gap-2">
                            <Activity className="w-4 h-4 text-emerald-400" />
                            Response
                          </h4>
                          {!latestResult ? (
                            <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                              <Send className="w-8 h-8 mb-2 opacity-30" />
                              <p className="text-xs">Send a message to see the response</p>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${latestResult.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                <div className="flex items-center gap-2">
                                  {latestResult.success
                                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                    : <XCircle className="w-3.5 h-3.5 text-red-400" />
                                  }
                                  <span className={latestResult.success ? 'text-emerald-300' : 'text-red-300'}>
                                    {latestResult.success ? `HTTP ${latestResult.statusCode}` : latestResult.errorMessage}
                                  </span>
                                </div>
                                <span className="text-slate-500 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {latestResult.latencyMs}ms
                                </span>
                              </div>

                              {!latestResult.success && latestResult.errorMessage && (
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
                                    <p className="text-red-300 text-xs font-medium">Connection Failed</p>
                                  </div>
                                  <p className="text-red-400/80 text-xs">{latestResult.errorMessage}</p>
                                  <p className="text-slate-500 text-xs mt-2">
                                    Ensure your n8n instance is running and the webhook node is active. Check the URL and try again.
                                  </p>
                                </div>
                              )}

                              {latestResult.responseParsed && (() => {
                                const reply = extractReplyText(latestResult.responseParsed);
                                return reply ? (
                                  <div className="bg-white/5 border border-white/10 rounded-lg p-3">
                                    <p className="text-slate-400 text-xs mb-1.5 font-medium">n8n Reply</p>
                                    <p className="text-white text-sm">{reply}</p>
                                  </div>
                                ) : null;
                              })()}

                              {Object.keys(latestResult.mappedFields).length > 0 && (
                                <div>
                                  <p className="text-slate-500 text-xs mb-2 font-medium">Mapped Response Fields</p>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {Object.entries(latestResult.mappedFields).map(([k, v]) => (
                                      <div key={k} className="flex gap-2 text-xs">
                                        <span className="text-blue-300 font-mono flex-shrink-0">{k}</span>
                                        <span className="text-slate-400 truncate">{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {latestResult.responseRaw && (
                                <details className="group">
                                  <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-400 transition-colors select-none">
                                    View raw response
                                  </summary>
                                  <pre className="mt-2 text-xs text-slate-400 bg-black/30 rounded-lg p-3 overflow-x-auto max-h-32 overflow-y-auto font-mono whitespace-pre-wrap break-all">
                                    {latestResult.responseRaw.length > 1000
                                      ? latestResult.responseRaw.slice(0, 1000) + '\n...(truncated)'
                                      : latestResult.responseRaw}
                                  </pre>
                                </details>
                              )}
                            </div>
                          )}

                          {results.length > 1 && (
                            <div>
                              <p className="text-slate-600 text-xs mb-2">Previous tests</p>
                              <div className="space-y-1">
                                {results.slice(1, 5).map((r, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-slate-500">
                                    <span>{new Date(r.timestamp).toLocaleTimeString()}</span>
                                    <span className={r.success ? 'text-emerald-500' : 'text-red-500'}>
                                      {r.success ? `${r.statusCode} - ${r.latencyMs}ms` : 'Failed'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right - Activity & Interactions Log */}
        <div className="space-y-4">
          {/* Activity Log */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-white text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Activity
              </h3>
              {activityLog.length > 0 && (
                <button onClick={() => setActivityLog([])} className="text-slate-600 hover:text-slate-400 text-xs transition-colors">
                  Clear
                </button>
              )}
            </div>
            <div ref={activityRef} className="divide-y divide-white/5 max-h-[280px] overflow-y-auto">
              {activityLog.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-slate-600">
                  <Activity className="w-8 h-8 mb-2 opacity-30" />
                  <p className="text-xs">No activity yet</p>
                </div>
              ) : (
                activityLog.map((entry, i) => (
                  <div key={i} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                    <p className={`text-xs font-medium ${activityColors[entry.action] || 'text-slate-300'}`}>
                      {entry.detail}
                    </p>
                    <p className="text-slate-600 text-xs mt-0.5">
                      {new Date(entry.ts).toLocaleTimeString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Interactions Log */}
          <div className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <h3 className="text-white text-sm font-medium flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Interaction Log
              </h3>
              <button onClick={fetchRecentInteractions} className="text-slate-600 hover:text-slate-400 text-xs transition-colors">
                Refresh
              </button>
            </div>
            <div className="divide-y divide-white/5 max-h-[240px] overflow-y-auto">
              {recentInteractions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                  <Zap className="w-6 h-6 mb-2 opacity-30" />
                  <p className="text-xs">No interactions recorded</p>
                </div>
              ) : (
                recentInteractions.map((inter) => (
                  <div key={inter.id} className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {inter.success
                          ? <CheckCircle className="w-3 h-3 text-emerald-400" />
                          : <XCircle className="w-3 h-3 text-red-400" />
                        }
                        <span className="text-xs text-slate-300">
                          {inter.direction === 'outbound' ? 'Sent' : 'Received'} - HTTP {inter.response_status || 'N/A'}
                        </span>
                      </div>
                      <span className="text-slate-600 text-xs">{inter.latency_ms}ms</span>
                    </div>
                    {inter.error_message && (
                      <p className="text-red-400/70 text-xs mt-0.5 truncate">{inter.error_message}</p>
                    )}
                    <p className="text-slate-600 text-xs mt-0.5">
                      {new Date(inter.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Info card */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-blue-300 text-xs font-medium">n8n Webhook Integration</p>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed">
              Paste your n8n webhook URL to establish a direct connection. Messages are sent as HTTP POST requests and responses from n8n are processed back into the system.
            </p>
            <div className="pt-1 space-y-1">
              <p className="text-slate-500 text-xs font-medium">Auto-detected reply fields:</p>
              <p className="text-slate-600 text-xs font-mono">{RESPONSE_FIELD_CANDIDATES.join(', ')}</p>
            </div>
            <div className="pt-1 space-y-1">
              <p className="text-slate-500 text-xs font-medium">All interactions are logged for traceability.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-white font-semibold text-lg">{editing ? 'Edit Webhook' : 'New Webhook Connection'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="e.g. n8n Facebook Messenger"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">n8n Webhook URL</label>
                <input
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-mono"
                  placeholder="https://your-n8n-instance.com/webhook/..."
                />
                <p className="text-slate-500 text-xs mt-2">
                  Enter the production webhook URL from your n8n workflow. No authentication headers needed - connection is direct.
                </p>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-slate-700'}`}
                  onClick={() => setForm({ ...form, is_active: !form.is_active })}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'left-5' : 'left-1'}`} />
                </div>
                <span className="text-slate-300 text-sm">Active</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 p-6 border-t border-white/5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm transition-colors">Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name || !form.url}
                className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl disabled:opacity-50 text-sm"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editing ? 'Save Changes' : 'Connect Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Webhook Confirmation */}
      <ConfirmModal
        open={!!confirmDeleteWh}
        title="Delete Webhook"
        message={`Are you sure you want to delete "${confirmDeleteWh?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteWh(null)}
      />
    </div>
  );
}
