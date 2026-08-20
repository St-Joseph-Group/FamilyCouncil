import React, { useEffect, useState, useRef } from 'react';
import { MessageCircle, Send, Paperclip, X, Loader2, RefreshCw, User, Bot, Trash2, AlertTriangle, Zap, ListChecks, Check } from 'lucide-react';
import { supabase, ChatLog, ChatMessage } from '../lib/supabase';
import { postToWebhookProxy, fetchActiveWebhook } from '../lib/webhookProxy';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';
import ConfirmModal from '../components/ConfirmModal';
import AccessRequestModal from '../components/AccessRequestModal';


const RESPONSE_FIELD_CANDIDATES = ['reply', 'message', 'text', 'response', 'content', 'output', 'answer'];

function parseResponseBody(raw: string): Record<string, unknown> | null {
  let str = raw.trim();
  const jsonStart = str.search(/[{\[]/);
  if (jsonStart > 0) str = str.slice(jsonStart);
  try { return JSON.parse(str); } catch { return null; }
}

function extractReply(data: Record<string, unknown>): string | null {
  for (const key of RESPONSE_FIELD_CANDIDATES) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  for (const key of RESPONSE_FIELD_CANDIDATES) {
    const val = data[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const nk of RESPONSE_FIELD_CANDIDATES) {
        if (typeof nested[nk] === 'string' && (nested[nk] as string).trim()) return nested[nk] as string;
      }
    }
  }
  for (const val of Object.values(data)) {
    if (typeof val === 'string' && val.trim().length > 2 && !val.match(/^[0-9a-f-]+$/i)) return val;
  }
  return null;
}

// No url: the proxy resolves the endpoint itself from the id, so the browser
// never needs to hold it.
interface ActiveWebhook {
  id: string;
  name: string;
}

export default function ChatbotPage() {
  const { user, profile, role, hasPermission, isSuperAdmin } = useAuth();
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<ChatLog | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [activeWebhook, setActiveWebhook] = useState<ActiveWebhook | null>(null);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  // Shown as a typing bubble while the assistant is composing a reply.
  const [botTyping, setBotTyping] = useState(false);
  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = isSuperAdmin() || hasPermission('chatbot', 'create');
  const canDelete = isSuperAdmin() || hasPermission('chatbot', 'delete');
  const messageListRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmDeleteSession, setConfirmDeleteSession] = useState<ChatLog | null>(null);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => { loadActiveWebhook(); fetchChatLogs(); }, []);
  useEffect(() => { if (selectedLog) fetchMessages(selectedLog.id); }, [selectedLog]);
  // Scroll the transcript itself. scrollIntoView walks up the tree and scrolls
  // every scrollable ancestor including the window, so a new message dragged
  // the whole page down instead of just the conversation.
  // botTyping is included so the indicator is visible the moment it appears.
  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, botTyping]);

  // Real-time subscription for messages in the selected conversation
  useEffect(() => {
    if (!selectedLog) return;
    const channel = supabase
      .channel(`chatbot-page-msgs-${selectedLog.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_log_id=eq.${selectedLog.id}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `chat_log_id=eq.${selectedLog.id}` },
        (payload) => {
          const oldMsg = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedLog?.id]);

  async function loadActiveWebhook() {
    // Id and name only. webhook_configs holds the endpoint URL and a headers
    // jsonb carrying the integration's token, neither of which this page needs.
    const { webhook, error } = await fetchActiveWebhook();

    if (error) {
      setActiveWebhook(null);
      setWebhookError(`Could not check the webhook connection: ${error}`);
      return;
    }

    if (webhook) {
      setActiveWebhook(webhook);
      setWebhookError(null);
    } else {
      setActiveWebhook(null);
      setWebhookError('No active webhook configured. Go to Configuration > Chatbot Setup to connect your n8n webhook.');
    }
  }

  const isAdmin = isSuperAdmin() || role?.name === 'council_admin';

  async function fetchChatLogs() {
    setLoading(true);
    let query = supabase.from('chat_logs').select('*').order('started_at', { ascending: false });
    if (!isAdmin && user?.id) {
      query = query.eq('participant_id', user.id);
    }
    const { data } = await query;
    setChatLogs(data || []);
    if (data && data.length > 0 && !selectedLog) setSelectedLog(data[0]);
    setLoading(false);
  }

  async function fetchMessages(logId: string) {
    setMsgLoading(true);
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_log_id', logId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setMsgLoading(false);
  }

  async function startNewSession() {
    const sessionId = `session_${Date.now()}`;
    const { data } = await supabase.from('chat_logs').insert({
      session_id: sessionId,
      platform: 'n8n_webhook',
      participant_name: profile?.full_name || profile?.email || 'User',
      participant_id: user?.id || '',
      status: 'active',
    }).select().maybeSingle();
    if (data) {
      setChatLogs((prev) => [data, ...prev]);
      setSelectedLog(data);
      setMessages([]);
    }
  }

  async function handleDeleteSession() {
    if (!confirmDeleteSession) return;
    const log = confirmDeleteSession;
    await supabase.from('chat_messages').delete().eq('chat_log_id', log.id);
    await supabase.from('chat_logs').delete().eq('id', log.id);
    await logAuditEvent(user?.id || null, 'delete_session', 'chatbot', log.id, 'chat_log', {
      session_id: log.session_id, participant_name: log.participant_name,
    });
    setChatLogs((prev) => prev.filter((l) => l.id !== log.id));
    if (selectedLog?.id === log.id) {
      setSelectedLog(null);
      setMessages([]);
    }
    setConfirmDeleteSession(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === chatLogs.length ? new Set() : new Set(chatLogs.map((l) => l.id))
    );
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);

    // Messages first: chat_messages.chat_log_id is ON DELETE CASCADE, but deleting
    // explicitly keeps this consistent with the single-session path above.
    const { error: msgError } = await supabase.from('chat_messages').delete().in('chat_log_id', ids);
    if (msgError) {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
      return;
    }

    const { error: logError } = await supabase.from('chat_logs').delete().in('id', ids);
    if (logError) {
      setBulkDeleting(false);
      setConfirmBulkDelete(false);
      return;
    }

    // One audit entry per session, matching the single-delete action name so the
    // audit log stays queryable by action.
    const deleted = chatLogs.filter((l) => selectedIds.has(l.id));
    await Promise.all(
      deleted.map((log) =>
        logAuditEvent(user?.id || null, 'delete_session', 'chatbot', log.id, 'chat_log', {
          session_id: log.session_id, participant_name: log.participant_name, bulk: true,
        })
      )
    );

    setChatLogs((prev) => prev.filter((l) => !selectedIds.has(l.id)));
    if (selectedLog && selectedIds.has(selectedLog.id)) {
      setSelectedLog(null);
      setMessages([]);
    }
    setBulkDeleting(false);
    setConfirmBulkDelete(false);
    exitSelectMode();
  }

  async function handleDeleteMessage() {
    if (!confirmDeleteMsg) return;
    const msg = confirmDeleteMsg;
    await supabase.from('chat_messages').delete().eq('id', msg.id);
    await logAuditEvent(user?.id || null, 'delete_message', 'chatbot', msg.id, 'chat_message', {
      chat_log_id: msg.chat_log_id,
      original_content: msg.content.slice(0, 100),
      sender_type: msg.sender_type,
    });

    if (selectedLog && activeWebhook) {
      try {
        await postToWebhookProxy(
          activeWebhook.id,
          {
            type: 'message_deleted',
            session_id: selectedLog.session_id,
            message_id: msg.id,
            deleted_by: user?.id,
            timestamp: new Date().toISOString(),
          },
          5000,
          10000,
        );
      } catch {
        // Non-blocking
      }
    }
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    setConfirmDeleteMsg(null);
  }

  async function logInteraction(
    direction: string, payload: Record<string, unknown>,
    responseStatus: number, responseBody: string,
    latencyMs: number, success: boolean, errorMessage: string,
  ) {
    if (!activeWebhook) return;
    await supabase.from('webhook_interactions').insert({
      webhook_config_id: activeWebhook.id,
      session_id: selectedLog?.session_id || '',
      direction,
      request_payload: payload,
      response_status: responseStatus,
      response_body: responseBody.slice(0, 5000),
      latency_ms: latencyMs,
      success,
      error_message: errorMessage,
      triggered_by: user?.id || null,
    });
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    if ((!message.trim() && !attachment) || !selectedLog || !activeWebhook) return;

    if (!canCreate) {
      setAccessRequest({ module: 'chatbot', action: 'create' });
      return;
    }

    const content = message.trim() || (attachment ? attachment.name : '');
    const logId = selectedLog.id;
    const sessionId = selectedLog.session_id;
    const isFile = !!attachment;
    setMessage('');
    setAttachment(null);

    // Insert user message immediately
    const { data: msgData } = await supabase.from('chat_messages').insert({
      chat_log_id: logId,
      sender_type: 'admin',
      sender_id: user?.id || '',
      message_type: isFile ? 'file' : 'text',
      content,
    }).select().maybeSingle();

    if (msgData) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (msgData as ChatMessage).id)) return prev;
        return [...prev, msgData as ChatMessage];
      });
    }

    const payload = {
      type: 'message',
      session_id: sessionId,
      sender: {
        id: user?.id,
        name: profile?.full_name || profile?.email,
        role: role?.display_name || role?.name || 'unknown',
        is_full_pledge: role?.is_full_pledge || false,
      },
      message: content,
      timestamp: new Date().toISOString(),
      platform: 'family_council_system',
    };

    // Fire webhook asynchronously - do not block input
    setBotTyping(true);
    (async () => {
      const start = Date.now();
      try {
        const response = await postToWebhookProxy(activeWebhook.id, payload, 60000, 120000);

        const latencyMs = Date.now() - start;

        if (response.ok) {
          const proxyData = await response.json().catch(() => null);
          const webhookStatus = proxyData?.status ?? 0;
          const rawBody = proxyData?.body || '';

          await logInteraction('outbound', payload, webhookStatus, rawBody, latencyMs, webhookStatus >= 200 && webhookStatus < 300, '');

          if (rawBody) {
            const responseData = parseResponseBody(rawBody);

            if (responseData) {
              const botReply = extractReply(responseData);
              if (botReply) {
                await supabase.from('chat_messages').insert({
                  chat_log_id: logId,
                  sender_type: 'bot',
                  sender_id: 'n8n-bot',
                  message_type: 'text',
                  content: botReply,
                  metadata: responseData,
                });
              }
            } else {
              const cleaned = rawBody.trim().replace(/^=+/, '').trim();
              if (cleaned && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
                await supabase.from('chat_messages').insert({
                  chat_log_id: logId,
                  sender_type: 'bot',
                  sender_id: 'n8n-bot',
                  message_type: 'text',
                  content: cleaned,
                });
              }
            }
          }
        } else {
          const latMs = Date.now() - start;
          const proxyError = await response.json().catch(() => null);
          await logInteraction('outbound', payload, response.status, '', latMs, false, proxyError?.error || `Proxy HTTP ${response.status}`);
          await supabase.from('chat_messages').insert({
            chat_log_id: logId,
            sender_type: 'bot',
            sender_id: 'system',
            message_type: 'text',
            content: proxyError?.error || 'Message delivery is being retried. Please wait a moment.',
          });
        }
      } catch (err) {
        const latencyMs = Date.now() - start;
        const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
        const errorMsg = isTimeout ? 'Request timed out' : (err instanceof Error ? err.message : 'Network error');
        await logInteraction('outbound', payload, 0, '', latencyMs, false, errorMsg);
        await supabase.from('chat_messages').insert({
          chat_log_id: logId,
          sender_type: 'bot',
          sender_id: 'system',
          message_type: 'text',
          content: 'Message sent but response is still processing. It will appear when ready.',
        });
      } finally {
        // finally, not the success path: a failed, timed-out, or rejected
        // webhook must not leave the indicator running forever. The catch block
        // above awaits its own writes, which can themselves throw.
        setBotTyping(false);
      }

      await logAuditEvent(user?.id || null, 'send_message', 'chatbot', logId, 'chat_log', { content: content.slice(0, 100) });
    })();
  }

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="page-fill-viewport flex gap-4">
      {/* Sidebar - Chat Sessions */}
      <div className="w-72 flex-shrink-0 flex flex-col bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <span className="text-white font-medium text-sm">Chat Sessions</span>
          </div>
          <div className="flex items-center gap-1.5">
            {chatLogs.length > 0 && (
              <button
                onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                title={selectMode ? 'Cancel selection' : 'Select sessions'}
                className={`p-1.5 rounded-lg transition-colors ${
                  selectMode
                    ? 'bg-slate-500/30 text-slate-200'
                    : 'bg-white/5 hover:bg-white/10 text-slate-400'
                }`}
              >
                {selectMode ? <X className="w-3.5 h-3.5" /> : <ListChecks className="w-3.5 h-3.5" />}
              </button>
            )}
            <button onClick={startNewSession} title="New session" className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors">
              <MessageCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {selectMode && (
          <div className="px-4 py-2 border-b border-white/5 bg-white/5 flex items-center justify-between gap-2">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {selectedIds.size === chatLogs.length ? 'Clear all' : 'Select all'}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{selectedIds.size} selected</span>
              <button
                onClick={() => {
                  if (!canDelete) { setAccessRequest({ module: 'chatbot', action: 'delete' }); return; }
                  setConfirmBulkDelete(true);
                }}
                disabled={selectedIds.size === 0}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            </div>
          </div>
        )}

        <div className={`px-4 py-2 border-b border-white/5 flex items-center gap-2 ${activeWebhook ? 'bg-emerald-500/5' : 'bg-amber-500/5'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${activeWebhook ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="text-xs text-slate-400 truncate">
            {activeWebhook ? activeWebhook.name : 'No webhook connected'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
            </div>
          ) : chatLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 px-4">
              <MessageCircle className="w-8 h-8 text-slate-600" />
              <p className="text-slate-400 text-sm text-center">No sessions yet</p>
              <button onClick={startNewSession} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">Start a session</button>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {chatLogs.map((log) => (
                <li key={log.id} className="relative">
                  <button
                    onClick={() => (selectMode ? toggleSelected(log.id) : setSelectedLog(log))}
                    className={`w-full text-left p-4 hover:bg-white/5 transition-colors ${selectedLog?.id === log.id && !selectMode ? 'bg-white/5' : ''} ${selectMode && selectedIds.has(log.id) ? 'bg-blue-500/10' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      {selectMode && (
                        <span
                          className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                            selectedIds.has(log.id)
                              ? 'bg-blue-500 border-blue-500'
                              : 'border-white/20'
                          }`}
                        >
                          {selectedIds.has(log.id) && <Check className="w-3 h-3 text-white" />}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block text-white text-sm font-medium truncate pr-8">{log.participant_name || 'Chat'}</span>
                        <p className="text-slate-500 text-xs mt-0.5">{new Date(log.started_at).toLocaleDateString()}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ${log.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                  </button>
                  {!selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!canDelete) { setAccessRequest({ module: 'chatbot', action: 'delete' }); return; } setConfirmDeleteSession(log); }}
                      className="absolute top-3 right-3 p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all z-10"
                      title="Delete session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Chat Window */}
      <div className="flex-1 flex flex-col bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden">
        {webhookError && !activeWebhook && (
          <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <p className="text-amber-300 text-sm">{webhookError}</p>
          </div>
        )}

        {!selectedLog ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <MessageCircle className="w-16 h-16 text-slate-600" />
            <p className="text-slate-400">Select a session or start a new one</p>
            <button onClick={startNewSession} className="bg-gradient-to-r from-blue-500 to-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm">
              New Chat Session
            </button>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{selectedLog.participant_name || 'Chat Session'}</p>
                  <p className="text-slate-400 text-xs flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${activeWebhook ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    {activeWebhook ? `Connected to ${activeWebhook.name}` : 'Webhook disconnected'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeWebhook && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                    <Zap className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-300 text-xs">n8n</span>
                  </div>
                )}
                <button onClick={() => fetchMessages(selectedLog.id)} className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-all">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div ref={messageListRef} className="flex-1 overflow-y-auto p-4 space-y-4">
              {msgLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                  <Bot className="w-12 h-12 text-slate-600" />
                  <p className="text-slate-400 text-sm">No messages yet. Send a message to start the conversation.</p>
                  {activeWebhook && (
                    <p className="text-slate-600 text-xs">Messages will be sent to n8n via webhook</p>
                  )}
                </div>
              ) : (
                messages.map((msg) => {
                  const isSystem = msg.sender_id === 'system';
                  return (
                    <div
                      key={msg.id}
                      className={`flex gap-3 group ${msg.sender_type === 'admin' ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                        msg.sender_type === 'admin'
                          ? 'bg-gradient-to-br from-blue-500 to-emerald-500'
                          : isSystem
                            ? 'bg-amber-500/20 border border-amber-500/30'
                            : 'bg-slate-700 border border-white/10'
                      }`}>
                        {msg.sender_type === 'admin' ? (
                          <User className="w-3.5 h-3.5 text-white" />
                        ) : isSystem ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Bot className="w-3.5 h-3.5 text-slate-300" />
                        )}
                      </div>
                      <div className={`max-w-[70%] flex flex-col gap-1 ${msg.sender_type === 'admin' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.sender_type === 'admin'
                            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-sm'
                            : isSystem
                              ? 'bg-amber-500/10 border border-amber-500/20 text-amber-200 rounded-tl-sm'
                              : 'bg-slate-700 text-slate-200 border border-white/5 rounded-tl-sm'
                        }`}>
                          {msg.sender_type === 'bot' || msg.sender_type === 'user' ? (
                            <div className="bot-message-content" dangerouslySetInnerHTML={{ __html: msg.content }} />
                          ) : (
                            msg.content
                          )}
                          {msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-blue-300 underline text-xs">
                              {msg.attachment_type || 'Attachment'}
                            </a>
                          )}
                        </div>
                        <div className={`flex items-center gap-2 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : 'flex-row'}`}>
                          <span className="text-slate-600 text-xs px-1">{formatTime(msg.created_at)}</span>
                          {!isSystem && (
                            <button
                              onClick={() => {
                                if (!canDelete) { setAccessRequest({ module: 'chatbot', action: 'delete' }); return; }
                                setConfirmDeleteMsg(msg);
                              }}
                              className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Delete message"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {botTyping && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                  </div>
                  <div
                    className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3"
                    role="status"
                    aria-live="polite"
                  >
                    {/* Visible dots for sighted users, one readable sentence for
                        screen readers, which must not hear three bouncing dots. */}
                    <span className="sr-only">The assistant is typing a reply.</span>
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <span className="w-2 h-2 rounded-full bg-slate-400 motion-safe:animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 motion-safe:animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-2 h-2 rounded-full bg-slate-400 motion-safe:animate-bounce" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={sendMessage} className="p-4 border-t border-white/5">
              {attachment && (
                <div className="flex items-center gap-2 mb-3 p-2 bg-white/5 rounded-xl">
                  <Paperclip className="w-4 h-4 text-blue-400" />
                  <span className="text-slate-300 text-sm flex-1 truncate">{attachment.name}</span>
                  <button type="button" onClick={() => setAttachment(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all flex-shrink-0">
                  <Paperclip className="w-4 h-4" />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={activeWebhook ? 'Type a message...' : 'Connect a webhook first...'}
                  disabled={!activeWebhook}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-sm disabled:opacity-50"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                />
                <button
                  type="submit"
                  disabled={(!message.trim() && !attachment) || !activeWebhook}
                  className="p-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white rounded-xl transition-all disabled:opacity-50 flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* Delete Session Confirmation */}
      <ConfirmModal
        open={!!confirmDeleteSession}
        title="Delete Session"
        message={`Delete "${confirmDeleteSession?.participant_name || 'Chat'}" session? All messages will be permanently removed.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteSession}
        onCancel={() => setConfirmDeleteSession(null)}
      />

      {/* Bulk Delete Confirmation */}
      <ConfirmModal
        open={confirmBulkDelete}
        title={`Delete ${selectedIds.size} Session${selectedIds.size === 1 ? '' : 's'}`}
        message={`Delete ${selectedIds.size} selected session${selectedIds.size === 1 ? '' : 's'}? All messages in ${selectedIds.size === 1 ? 'it' : 'them'} will be permanently removed.`}
        confirmLabel={bulkDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
        onConfirm={handleBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Delete Message Confirmation */}
      <ConfirmModal
        open={!!confirmDeleteMsg}
        title="Delete Message"
        message="Are you sure you want to delete this message? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteMessage}
        onCancel={() => setConfirmDeleteMsg(null)}
      />

      {/* Access Request Modal */}
      <AccessRequestModal
        open={!!accessRequest}
        module={accessRequest?.module || ''}
        action={accessRequest?.action || ''}
        onClose={() => setAccessRequest(null)}
      />
    </div>
  );
}
