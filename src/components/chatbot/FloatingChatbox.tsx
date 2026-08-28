import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Minimize2, Maximize2, Bot, User, Loader2, Trash2, AlertTriangle, ShieldAlert, Plus, ArrowLeft, Clock, Paperclip } from 'lucide-react';
import { supabase, ChatLog, ChatMessage } from '../../lib/supabase';
import { postToWebhookProxy, fetchActiveWebhook } from '../../lib/webhookProxy';
import { useAuth } from '../../contexts/AuthContext';
import { logAuditEvent } from '../../lib/audit';
import { imageFromClipboard, uploadChatAttachment, isImageAttachment, UploadedAttachment } from '../../lib/chatAttachments';
import ConfirmModal from '../ConfirmModal';
import AccessRequestModal from '../AccessRequestModal';


const RESPONSE_FIELD_CANDIDATES = ['reply', 'message', 'text', 'response', 'content', 'output', 'answer'];

function parseResponseBody(raw: string): Record<string, unknown> | null {
  let str = raw.trim();
  // Strip leading non-JSON characters (e.g., "=" prefix from some n8n responses)
  const jsonStart = str.search(/[{\[]/);
  if (jsonStart > 0) str = str.slice(jsonStart);
  try { return JSON.parse(str); } catch { return null; }
}

function extractReply(data: Record<string, unknown>): string | null {
  // Check top-level reply fields
  for (const key of RESPONSE_FIELD_CANDIDATES) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) return val;
  }
  // Check one level of nesting
  for (const key of RESPONSE_FIELD_CANDIDATES) {
    const val = data[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>;
      for (const nk of RESPONSE_FIELD_CANDIDATES) {
        if (typeof nested[nk] === 'string' && (nested[nk] as string).trim()) return nested[nk] as string;
      }
    }
  }
  // Check all string values at top level as last resort
  for (const val of Object.values(data)) {
    if (typeof val === 'string' && val.trim().length > 2 && !val.match(/^[0-9a-f-]+$/i)) return val;
  }
  return null;
}

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

function formatListTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// No url: the proxy resolves the endpoint itself from the id, so the browser
// never needs to hold it.
interface ActiveWebhook {
  id: string;
  name: string;
}

type ViewState = 'list' | 'compose';

export default function FloatingChatbox() {
  const { user, profile, role, hasPermission, isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversations, setConversations] = useState<(ChatLog & { lastMessage?: ChatMessage })[]>([]);
  const [activeConversation, setActiveConversation] = useState<ChatLog | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  // Local preview for a pending image, revoked on change so a long session of
  // pasted screenshots does not leak object URLs.
  const attachmentPreview = React.useMemo(
    () => (attachment && attachment.type.startsWith('image/') ? URL.createObjectURL(attachment) : null),
    [attachment],
  );
  React.useEffect(
    () => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); },
    [attachmentPreview],
  );
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [viewState, setViewState] = useState<ViewState>('list');
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeWebhook, setActiveWebhook] = useState<ActiveWebhook | null>(null);
  // Shown as a typing bubble while the assistant is composing a reply.
  // Keyed by conversation id rather than a single flag: the indicator belongs
  // to the conversation that is actually waiting, so switching conversations
  // must not carry it across.
  const [typingConvoIds, setTypingConvoIds] = useState<Set<string>>(new Set());
  const botTyping = activeConversation ? typingConvoIds.has(activeConversation.id) : false;
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);
  const [confirmDeleteConvo, setConfirmDeleteConvo] = useState<string | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);

  const [accessRequest, setAccessRequest] = useState<{ module: string; action: string } | null>(null);

  const canCreate = isSuperAdmin() || hasPermission('chatbot', 'create');
  const canRead = isSuperAdmin() || hasPermission('chatbot', 'read');
  const canDelete = isSuperAdmin() || hasPermission('chatbot', 'delete');

  // botTyping included so the indicator scrolls into view when it appears.
  // Scroll the transcript, not its ancestors: scrollIntoView would scroll the
  // page behind this floating widget every time a message arrived.
  // attachment and attachError are dependencies because they change the height
  // of the composer. Pasting a screenshot while the assistant is replying grows
  // the composer, shrinks the transcript, and pushes the typing indicator below
  // the fold - the scroll has to run again once the layout has settled.
  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, botTyping, attachment, attachError]);
  useEffect(() => { loadActiveWebhook(); }, []);

  // Real-time subscription for messages in the active conversation
  useEffect(() => {
    if (!activeConversation) return;
    const channel = supabase
      .channel(`floating-chat-msgs-${activeConversation.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_log_id=eq.${activeConversation.id}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          if (!open || minimized) setUnreadCount((c) => c + 1);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `chat_log_id=eq.${activeConversation.id}` },
        (payload) => {
          const oldMsg = payload.old as { id: string };
          setMessages((prev) => prev.filter((m) => m.id !== oldMsg.id));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeConversation?.id, open, minimized]);

  async function loadActiveWebhook() {
    // Id and name only. See the note in ChatbotPage: webhook_configs carries
    // the endpoint URL and the integration's headers, neither needed here.
    const { webhook } = await fetchActiveWebhook();
    if (webhook) setActiveWebhook(webhook);
  }

  async function fetchConversations() {
    if (!user) return;
    setLoadingConvos(true);
    const { data } = await supabase
      .from('chat_logs')
      .select('*')
      .eq('participant_id', user.id)
      .eq('platform', 'n8n_webhook')
      .order('created_at', { ascending: false });

    if (data) {
      const convosWithLastMsg: (ChatLog & { lastMessage?: ChatMessage })[] = [];
      for (const log of data) {
        const { data: lastMsg } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('chat_log_id', log.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        convosWithLastMsg.push({ ...log, lastMessage: lastMsg || undefined });
      }
      setConversations(convosWithLastMsg);
    }
    setLoadingConvos(false);
  }

  async function loadMessages(chatLog: ChatLog) {
    setActiveConversation(chatLog);
    setViewState('compose');
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_log_id', chatLog.id)
      .order('created_at', { ascending: true });
    setMessages((data as ChatMessage[]) || []);
  }

  async function startNewConversation() {
    if (!canCreate) {
      setAccessRequest({ module: 'chatbot', action: 'create' });
      return;
    }
    const sid = `float_${user?.id}_${Date.now()}`;
    const { data } = await supabase.from('chat_logs').insert({
      session_id: sid,
      platform: 'n8n_webhook',
      participant_name: profile?.full_name || profile?.email || 'User',
      participant_id: user?.id || '',
      status: 'active',
    }).select().maybeSingle();
    if (data) {
      setActiveConversation(data as ChatLog);
      setMessages([]);
      setViewState('compose');
    }
  }

  function closeConversation() {
    setActiveConversation(null);
    setMessages([]);
    setViewState('list');
    fetchConversations();
  }

  async function handleOpen() {
    if (!canRead) {
      setAccessRequest({ module: 'chatbot', action: 'read' });
      return;
    }
    setOpen(true);
    setMinimized(false);
    setUnreadCount(0);
    await loadActiveWebhook();
    await fetchConversations();
  }

  async function handleDeleteMessage() {
    if (!confirmDeleteMsg || !activeConversation) return;
    const msg = confirmDeleteMsg;
    await supabase.from('chat_messages').delete().eq('id', msg.id);
    await logAuditEvent(user?.id || null, 'delete_message', 'chatbot', msg.id, 'chat_message', {
      source: 'floating_chatbox',
      original_content: msg.content.slice(0, 100),
      sender_type: msg.sender_type,
    });

    if (activeWebhook) {
      try {
        await postToWebhookProxy(
          activeWebhook.id,
          {
            type: 'message_deleted',
            session_id: activeConversation.session_id,
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

  async function handleDeleteConversation() {
    const convoId = confirmDeleteConvo;
    if (!convoId) return;
    const convo = conversations.find((c) => c.id === convoId) || activeConversation;
    await supabase.from('chat_messages').delete().eq('chat_log_id', convoId);
    await supabase.from('chat_logs').delete().eq('id', convoId);
    await logAuditEvent(user?.id || null, 'delete_conversation', 'chatbot', convoId, 'chat_log', {
      session_id: convo?.session_id || '',
      source: 'floating_chatbox',
    });
    setConfirmDeleteConvo(null);
    if (activeConversation?.id === convoId) {
      setActiveConversation(null);
      setMessages([]);
      setViewState('list');
    }
    fetchConversations();
  }

  function attemptDeleteConversation(convoId?: string) {
    if (!canDelete) {
      setAccessRequest({ module: 'chatbot', action: 'delete' });
      return;
    }
    setConfirmDeleteConvo(convoId || activeConversation?.id || null);
  }

  function attemptDelete(msg: ChatMessage) {
    if (!canDelete) {
      setAccessRequest({ module: 'chatbot', action: 'delete' });
      return;
    }
    setConfirmDeleteMsg(msg);
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if ((!input.trim() && !attachment) || !activeConversation || !activeWebhook) return;

    if (!canCreate) {
      setAccessRequest({ module: 'chatbot', action: 'create' });
      return;
    }

    const content = input.trim() || (attachment ? attachment.name : '');
    const convoId = activeConversation.id;
    const sessionId = activeConversation.session_id;
    const pendingFile = attachment;
    setInput('');
    setAttachment(null);

    // Upload before inserting so the row carries its attachment from the start.
    let uploaded: UploadedAttachment | null = null;
    if (pendingFile) {
      setUploading(true);
      uploaded = await uploadChatAttachment(pendingFile, convoId);
      setUploading(false);
      if (!uploaded) setAttachError('That file could not be uploaded, so the message was sent without it.');
    }

    // Insert user message immediately (real-time subscription will also pick it up)
    const { data: msgData } = await supabase.from('chat_messages').insert({
      chat_log_id: convoId,
      sender_type: 'admin',
      sender_id: user?.id || '',
      message_type: pendingFile ? 'file' : 'text',
      content,
      attachment_url: uploaded ? uploaded.url : null,
      attachment_type: uploaded ? uploaded.type : null,
    }).select().maybeSingle();

    if (msgData) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === (msgData as ChatMessage).id)) return prev;
        return [...prev, msgData as ChatMessage];
      });
    }

    // Fire webhook asynchronously - do not block input
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
      // The workflow downloads this and hands it to Gemini vision, so a pasted
      // screenshot can be asked about rather than merely stored.
      image_url: uploaded && isImageAttachment(uploaded.type) ? uploaded.url : null,
      attachment_url: uploaded ? uploaded.url : null,
      attachment_type: uploaded ? uploaded.type : null,
      timestamp: new Date().toISOString(),
      source: 'floating_chatbox',
    };

    // Non-blocking webhook call
    setTypingConvoIds((prev) => new Set(prev).add(convoId));
    (async () => {
      try {
        const res = await postToWebhookProxy(activeWebhook.id, payload, 60000, 120000);

        if (res.ok) {
          const proxyData = await res.json().catch(() => null);
          const rawBody = proxyData?.body || '';

          if (rawBody) {
            const responseData = parseResponseBody(rawBody);

            if (responseData) {
              const reply = extractReply(responseData);
              if (reply) {
                await supabase.from('chat_messages').insert({
                  chat_log_id: convoId,
                  sender_type: 'bot',
                  sender_id: 'n8n-bot',
                  message_type: 'text',
                  content: reply,
                  metadata: responseData,
                });
              }
            } else {
              const cleaned = rawBody.trim().replace(/^=+/, '').trim();
              if (cleaned && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
                await supabase.from('chat_messages').insert({
                  chat_log_id: convoId,
                  sender_type: 'bot',
                  sender_id: 'n8n-bot',
                  message_type: 'text',
                  content: cleaned,
                });
              }
            }
          }
        } else {
          const proxyError = await res.json().catch(() => null);
          await supabase.from('chat_messages').insert({
            chat_log_id: convoId,
            sender_type: 'bot',
            sender_id: 'system',
            message_type: 'text',
            content: proxyError?.error || 'Message delivery is being retried. Please wait a moment.',
          });
        }
      } catch {
        await supabase.from('chat_messages').insert({
          chat_log_id: convoId,
          sender_type: 'bot',
          sender_id: 'system',
          message_type: 'text',
          content: 'Message sent but response is still processing. It will appear when ready.',
        });
      } finally {
        // finally, so a failed or timed-out webhook cannot leave the indicator
        // running forever. The catch block above awaits its own write.
        setTypingConvoIds((prev) => {
          const next = new Set(prev);
          next.delete(convoId);
          return next;
        });
      }
    })();
  }

  if (!user) return null;

  return (
    <>
      {/* Floating Action Button */}
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white rounded-full shadow-2xl hover:shadow-blue-500/40 transition-all duration-300 flex items-center justify-center z-50 hover:scale-110"
        >
          <MessageCircle className="w-6 h-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Panel */}
      {open && (
        <div className={`floating-chat fixed bottom-6 right-6 z-50 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 flex flex-col transition-all duration-300 ${minimized ? (activeConversation ? 'w-80' : 'w-80 h-14') : 'w-96 h-[520px]'}`}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold">Messaging</p>
              <p className="text-slate-400 text-xs flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${activeWebhook ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {activeWebhook ? 'Connected' : 'No webhook'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMinimized(!minimized)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => { setOpen(false); setViewState('list'); setActiveConversation(null); }} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Minimized input when in active conversation */}
          {minimized && activeConversation && (
            <form onSubmit={handleSend} className="p-2 border-t border-white/5 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={activeWebhook ? 'Write a message...' : 'No webhook'}
                disabled={!activeWebhook}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-xs disabled:opacity-50"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <button type="submit" disabled={!input.trim() || !activeWebhook} className="p-1.5 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl disabled:opacity-50 transition-all hover:from-blue-600 hover:to-emerald-600 flex-shrink-0">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}

          {!minimized && (
            <>
              {viewState === 'list' ? (
                /* Conversation List View */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* New Message Button */}
                  <div className="p-3 border-b border-white/5">
                    <button
                      onClick={startNewConversation}
                      className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white text-sm font-medium rounded-xl transition-all shadow-lg hover:shadow-blue-500/20"
                    >
                      <Plus className="w-4 h-4" />
                      New Message
                    </button>
                  </div>

                  {/* Conversation List */}
                  <div className="flex-1 overflow-y-auto">
                    {loadingConvos ? (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                      </div>
                    ) : conversations.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                        <div className="w-14 h-14 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                          <MessageCircle className="w-6 h-6 text-slate-600" />
                        </div>
                        <p className="text-slate-400 text-sm font-medium">No messages yet</p>
                        <p className="text-slate-600 text-xs mt-1">Start a new conversation</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {conversations.map((convo) => (
                          <div
                            key={convo.id}
                            className="flex items-center gap-3 p-3 hover:bg-white/5 transition-colors group"
                          >
                            <button
                              onClick={() => loadMessages(convo)}
                              className="flex items-center gap-3 flex-1 min-w-0 text-left"
                            >
                              <div className="w-9 h-9 bg-slate-800 rounded-full flex items-center justify-center flex-shrink-0 group-hover:bg-slate-700 transition-colors">
                                <Bot className="w-4 h-4 text-slate-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-white text-sm font-medium truncate">
                                    Council Assistant
                                  </p>
                                  <span className="text-slate-500 text-xs flex-shrink-0">
                                    {convo.lastMessage ? formatListTime(convo.lastMessage.created_at) : formatListTime(convo.created_at)}
                                  </span>
                                </div>
                                <p className="text-slate-400 text-xs truncate mt-0.5">
                                  {convo.lastMessage
                                    ? stripHtml(convo.lastMessage.content).slice(0, 50)
                                    : 'No messages yet'}
                                </p>
                              </div>
                            </button>
                            <button
                              onClick={() => attemptDeleteConversation(convo.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
                              title="Delete conversation"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Compose / Active Conversation View */
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Conversation Header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 flex-shrink-0">
                    <button
                      onClick={closeConversation}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="w-7 h-7 bg-slate-800 rounded-full flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-slate-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-medium">Council Assistant</p>
                      <p className="text-slate-500 text-[10px] flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {activeConversation ? formatListTime(activeConversation.created_at) : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => attemptDeleteConversation()}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div ref={messageListRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2.5">
                    {!activeWebhook && (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <p className="text-amber-300 text-xs">No webhook configured. Set up a webhook in Configuration.</p>
                      </div>
                    )}
                    {!canCreate && (
                      <div className="flex items-center gap-2 p-3 bg-slate-700/50 border border-white/5 rounded-xl">
                        <ShieldAlert className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <p className="text-slate-400 text-xs">Read-only access. Sending messages requires Create permission.</p>
                      </div>
                    )}
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-2 text-center py-8">
                        <Bot className="w-8 h-8 text-slate-600" />
                        <p className="text-slate-400 text-sm">Start the conversation</p>
                        <p className="text-slate-600 text-xs">Type a message below</p>
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isSystem = msg.sender_id === 'system';
                        return (
                          <div
                            key={msg.id}
                            className={`flex gap-2 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : 'flex-row'}`}
                          >
                            <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center ${
                              msg.sender_type === 'admin'
                                ? 'bg-gradient-to-br from-blue-500 to-emerald-500'
                                : isSystem
                                  ? 'bg-amber-500/20'
                                  : 'bg-slate-700'
                            }`}>
                              {msg.sender_type === 'admin' ? (
                                <User className="w-3 h-3 text-white" />
                              ) : isSystem ? (
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                              ) : (
                                <Bot className="w-3 h-3 text-slate-300" />
                              )}
                            </div>
                            <div className={`flex flex-col gap-0.5 max-w-[75%] min-w-0 ${msg.sender_type === 'admin' ? 'items-end' : 'items-start'}`}>
                              <div className={`px-3 py-2 rounded-xl text-xs leading-relaxed ${
                                msg.sender_type === 'admin'
                                  ? 'bg-blue-600 text-white rounded-tr-sm'
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
                                  isImageAttachment(msg.attachment_type) ? (
                                    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
                                      <img src={msg.attachment_url} alt={msg.content || 'Attached image'} className="max-w-full max-h-40 rounded-lg border border-white/10" />
                                    </a>
                                  ) : (
                                    <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="block mt-1.5 text-blue-300 underline text-[11px]">
                                      {msg.attachment_type || 'Attachment'}
                                    </a>
                                  )
                                )}
                              </div>
                              <div className={`flex items-center gap-1 ${msg.sender_type === 'admin' ? 'flex-row-reverse' : ''}`}>
                                <span className="text-slate-600 text-[10px]">{formatMessageTime(msg.created_at)}</span>
                                {!isSystem && (
                                  <button
                                    onClick={() => attemptDelete(msg)}
                                    className="p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                    title="Delete message"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}

                    {botTyping && (
                      <div className="flex gap-2 justify-start">
                        <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        </div>
                        <div
                          className="bg-white/5 border border-white/10 rounded-2xl rounded-tl-sm px-3 py-2"
                          role="status"
                          aria-live="polite"
                        >
                          {/* Dots for sighted users, one sentence for screen
                              readers, which must not hear three bouncing dots. */}
                          <span className="sr-only">The assistant is typing a reply.</span>
                          <span className="flex items-center gap-1" aria-hidden="true">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce [animation-delay:-0.3s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce [animation-delay:-0.15s]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce" />
                          </span>
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Quick Replies */}
                  <div className="px-3 pb-1.5 flex gap-1.5 overflow-x-auto scrollbar-none">
                    {['Hello', 'Meeting info', 'Announcements'].map((qr) => (
                      <button key={qr} onClick={() => setInput(qr)} className="text-[11px] px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-full whitespace-nowrap transition-colors border border-white/10">
                        {qr}
                      </button>
                    ))}
                  </div>

                  {/* Input */}
                  <form onSubmit={handleSend} className="p-3 border-t border-white/5 flex flex-col gap-2">
                    {attachment && (
                      <div className="flex items-center gap-2 p-1.5 bg-white/5 rounded-lg">
                        {attachmentPreview ? (
                          <img src={attachmentPreview} alt={attachment.name} className="w-8 h-8 object-cover rounded border border-white/10 flex-shrink-0" />
                        ) : (
                          <Paperclip className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                        )}
                        <span className="text-slate-300 text-[11px] flex-1 truncate">{attachment.name}</span>
                        {uploading && <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin flex-shrink-0" aria-label="Uploading" />}
                        <button type="button" onClick={() => setAttachment(null)} className="text-slate-400 hover:text-white flex-shrink-0" aria-label="Remove attachment">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {attachError && <p className="text-[11px] text-amber-300">{attachError}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => attachInputRef.current?.click()}
                        disabled={!activeWebhook}
                        title="Attach an image"
                        className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-all flex-shrink-0 disabled:opacity-50"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                      </button>
                      <input
                        ref={attachInputRef}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => { setAttachment(e.target.files?.[0] || null); setAttachError(null); }}
                      />
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={!canCreate ? 'No send permission' : activeWebhook ? 'Write a message, or paste a screenshot...' : 'No webhook connected'}
                        disabled={!activeWebhook}
                        className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 text-xs disabled:opacity-50"
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        onPaste={(e) => {
                          const pastedImage = imageFromClipboard(e);
                          if (!pastedImage) return; // ordinary text paste, leave it alone
                          e.preventDefault();
                          setAttachment(pastedImage);
                          setAttachError(null);
                        }}
                      />
                      <button type="submit" disabled={(!input.trim() && !attachment) || !activeConversation || !activeWebhook} className="p-2 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl disabled:opacity-50 transition-all hover:from-blue-600 hover:to-emerald-600 flex-shrink-0">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Delete Message Confirmation */}
      <ConfirmModal
        open={!!confirmDeleteMsg}
        title="Delete Message"
        message="Are you sure you want to delete this message?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteMessage}
        onCancel={() => setConfirmDeleteMsg(null)}
      />

      {/* Delete Conversation Confirmation */}
      <ConfirmModal
        open={!!confirmDeleteConvo}
        title="Delete Conversation"
        message="Are you sure you want to delete this entire conversation? All messages will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConversation}
        onCancel={() => setConfirmDeleteConvo(null)}
      />

      {/* Access Request Modal */}
      <AccessRequestModal
        open={!!accessRequest}
        module={accessRequest?.module || ''}
        action={accessRequest?.action || ''}
        onClose={() => setAccessRequest(null)}
      />
    </>
  );
}
