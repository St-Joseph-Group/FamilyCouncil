import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const rawClient = createClient(supabaseUrl, supabaseAnonKey);

export interface DbErrorEvent {
  table: string;
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

type DbErrorListener = (event: DbErrorEvent) => void;

const listeners = new Set<DbErrorListener>();

/**
 * Subscribe to every failed PostgREST call, wherever it was made.
 *
 * Most call sites destructure only `data` and drop `error`, so a failure renders
 * as an empty list rather than an error. That is how the Council Records embed
 * ambiguity (300 PGRST201) stayed invisible while three records existed. This
 * gives one place to observe those failures without touching all of them.
 */
export function onDbError(listener: DbErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function reportDbError(table: string, error: { message?: string; code?: string; details?: string | null; hint?: string | null }) {
  const event: DbErrorEvent = {
    table,
    code: error.code,
    message: error.message || 'Unknown database error',
    details: error.details,
    hint: error.hint,
  };

  console.error(`[supabase] ${table}: ${event.code ? event.code + ' ' : ''}${event.message}`, error);
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // a broken listener must never take down the caller
    }
  });
}

/**
 * Wrap a PostgREST builder so awaiting it reports any error before handing the
 * result back unchanged. Builders are thenable and chainable, so intercept
 * `then` and re-wrap every chained method that returns another builder.
 */
function wrapBuilder<T extends object>(builder: T, table: string): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'then' && typeof value === 'function') {
        const thenFn = value as (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => unknown;
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          thenFn.call(
            target,
            (result: unknown) => {
              const r = result as { error?: { message?: string; code?: string; details?: string | null; hint?: string | null } | null };
              if (r && r.error) reportDbError(table, r.error);
              return onFulfilled ? onFulfilled(result) : result;
            },
            onRejected
          );
      }

      if (typeof value === 'function') {
        const fn = value as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => {
          const out = fn.apply(target, args);
          // filter/modifier methods return the builder for chaining
          return out && typeof out === 'object' ? wrapBuilder(out as object, table) : out;
        };
      }

      return value;
    },
  }) as T;
}

export const supabase = new Proxy(rawClient, {
  get(target, prop, receiver) {
    if (prop === 'from') {
      return (table: string) => wrapBuilder(target.from(table) as object, table);
    }
    if (prop === 'rpc') {
      const rpcFn = target.rpc as unknown as (...args: unknown[]) => object;
      return (fn: string, ...args: unknown[]) =>
        wrapBuilder(rpcFn.apply(target, [fn, ...args]), `rpc:${fn}`);
    }
    const value = Reflect.get(target, prop, receiver);
    // Bind methods to the real client so `this` is never the proxy. Supabase
    // internals (auth, realtime) must not observe a wrapped receiver.
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      roles: { Row: Role; Insert: Partial<Role>; Update: Partial<Role> };
      permissions: { Row: Permission; Insert: Partial<Permission>; Update: Partial<Permission> };
      role_permissions: { Row: RolePermission; Insert: Partial<RolePermission>; Update: Partial<RolePermission> };
      council_groups: { Row: CouncilGroup; Insert: Partial<CouncilGroup>; Update: Partial<CouncilGroup> };
      council_members: { Row: CouncilMember; Insert: Partial<CouncilMember>; Update: Partial<CouncilMember> };
      council_records: { Row: CouncilRecord; Insert: Partial<CouncilRecord>; Update: Partial<CouncilRecord> };
      meetings: { Row: Meeting; Insert: Partial<Meeting>; Update: Partial<Meeting> };
      announcements: { Row: Announcement; Insert: Partial<Announcement>; Update: Partial<Announcement> };
      chat_logs: { Row: ChatLog; Insert: Partial<ChatLog>; Update: Partial<ChatLog> };
      chat_messages: { Row: ChatMessage; Insert: Partial<ChatMessage>; Update: Partial<ChatMessage> };
      audit_logs: { Row: AuditLog; Insert: Partial<AuditLog>; Update: Partial<AuditLog> };
      notifications: { Row: Notification; Insert: Partial<Notification>; Update: Partial<Notification> };
      navigation_items: { Row: NavigationItem; Insert: Partial<NavigationItem>; Update: Partial<NavigationItem> };
      navigation_access: { Row: NavigationAccess; Insert: Partial<NavigationAccess>; Update: Partial<NavigationAccess> };
    };
  };
};

export interface Profile {
  id: string;
  username: string | null;
  full_name: string;
  email: string;
  avatar_url: string;
  role_id: string | null;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  updated_at: string;
  role?: Role;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_system: boolean;
  is_full_pledge: boolean;
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  description: string;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface CouncilGroup {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouncilMember {
  id: string;
  council_group_id: string;
  profile_id: string;
  council_role: string;
  joined_at: string;
}

export interface CouncilRecord {
  id: string;
  council_group_id: string | null;
  title: string;
  content: string;
  record_type: string;
  status: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  council_group?: CouncilGroup;
  creator?: Profile;
}

export interface Meeting {
  id: string;
  council_group_id: string | null;
  title: string;
  description: string;
  meeting_date: string;
  location: string;
  status: string;
  notes: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  council_group?: CouncilGroup;
  creator?: Profile;
}

export interface Announcement {
  id: string;
  council_group_id: string | null;
  title: string;
  content: string;
  priority: string;
  is_published: boolean;
  publish_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  council_group?: CouncilGroup;
  creator?: Profile;
}

export interface ChatLog {
  id: string;
  session_id: string;
  platform: string;
  participant_name: string;
  participant_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  messages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  chat_log_id: string | null;
  sender_type: 'user' | 'bot' | 'admin';
  sender_id: string;
  message_type: string;
  content: string;
  attachment_url: string;
  attachment_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  module: string;
  target_id: string;
  target_type: string;
  details: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
  user?: Profile;
}

export interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  related_module: string;
  related_id: string;
  created_at: string;
}

export interface NavigationItem {
  id: string;
  name: string;
  label: string;
  path: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface NavigationAccess {
  id: string;
  role_id: string;
  nav_item_id: string;
  created_at: string;
}
