import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { User, Session, RealtimeChannel } from '@supabase/supabase-js';
import { supabase, Profile, Role, Permission } from '../lib/supabase';
import { logAuditEvent } from '../lib/audit';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: Role | null;
  permissions: Permission[];
  session: Session | null;
  loading: boolean;
  // true once the role's permission set has actually been fetched; until then
  // hasPermission() answers false for everything and must not be trusted
  permissionsLoaded: boolean;
  forcedLogoutMessage: string | null;
  clearForcedLogoutMessage: () => void;
  signIn: (emailOrUsername: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  hasPermission: (module: string, action: string) => boolean;
  isSuperAdmin: () => boolean;
}

/** Longest sign-out will wait on the audit write before giving up on it. */
const AUDIT_TIMEOUT_MS = 2500;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [forcedLogoutMessage, setForcedLogoutMessage] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userRef = useRef<User | null>(null);
  const roleRef = useRef<Role | null>(null);

  userRef.current = user;
  roleRef.current = role;

  const loadProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*, role:roles(*)')
      .eq('id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData as Profile);
      const roleData = (profileData as Profile & { role: Role }).role;
      setRole(roleData || null);

      if (roleData) {
        const { data: permsData } = await supabase
          .from('role_permissions')
          .select('permission:permissions(*)')
          .eq('role_id', roleData.id);

        if (permsData) {
          setPermissions(permsData.map((rp: { permission: Permission }) => rp.permission));
        }
      } else {
        setPermissions([]);
      }
    }

    // set last: anything gated on permissions waits for this, so it must not
    // flip until the role_permissions query above has resolved
    setPermissionsLoaded(true);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await loadProfile(session.user.id);
          if (event === 'SIGNED_IN') {
            await supabase
              .from('profiles')
              .update({ last_login: new Date().toISOString() })
              .eq('id', session.user.id);
          }
        })();
      } else {
        setProfile(null);
        setRole(null);
        setPermissions([]);
        setPermissionsLoaded(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (!user) return;

    const channel = supabase
      .channel('permissions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permissions' },
        (payload) => {
          const currentUser = userRef.current;
          const currentRole = roleRef.current;
          if (!currentUser || !currentRole) return;

          const changedRoleId = (payload.new as { role_id?: string })?.role_id
            || (payload.old as { role_id?: string })?.role_id;

          if (changedRoleId === currentRole.id) {
            loadProfile(currentUser.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'roles' },
        (payload) => {
          const currentUser = userRef.current;
          const currentRole = roleRef.current;
          if (!currentUser || !currentRole) return;

          const updatedRoleId = (payload.new as { id?: string })?.id;
          if (updatedRoleId === currentRole.id) {
            loadProfile(currentUser.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const currentUser = userRef.current;
          if (!currentUser) return;

          const updatedProfileId = (payload.new as { id?: string })?.id;
          if (updatedProfileId === currentUser.id) {
            const isActive = (payload.new as { is_active?: boolean })?.is_active;
            if (isActive === false) {
              setForcedLogoutMessage('You are being forced to logout.');
              (async () => {
                await logAuditEvent(currentUser.id, 'auto_logout_inactive', 'auth', currentUser.id, 'user', {});
                await supabase.auth.signOut();
              })();
              return;
            }
            loadProfile(currentUser.id);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, loadProfile]);

  async function signIn(emailOrUsername: string, password: string) {
    let email = emailOrUsername;

    if (!emailOrUsername.includes('@')) {
      // profiles is not readable pre-authentication; resolve via SECURITY DEFINER rpc
      const { data: lookupEmail } = await supabase.rpc('get_email_by_username', {
        lookup_username: emailOrUsername,
      });
      if (lookupEmail) email = lookupEmail as string;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // no session yet, so audit_logs is not writable directly; use the SECURITY DEFINER rpc
      await supabase.rpc('log_failed_login', {
        identifier: emailOrUsername,
        reason: error.message,
      });
      return { error: error.message };
    }

    const { data: profileCheck } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileCheck && !profileCheck.is_active) {
      await logAuditEvent(data.user.id, 'login_blocked_inactive', 'auth', data.user.id, 'user', {});
      await supabase.auth.signOut();
      return { error: 'Your account is inactive. Please contact an administrator.' };
    }

    await logAuditEvent(data.user?.id || null, 'login_success', 'auth', data.user?.id || '', 'user', {});
    return { error: null };
  }

  async function signOut() {
    // The audit entry has to be written while the session is still valid, since
    // the audit_logs insert policy requires user_id = auth.uid(). But it must
    // never gate sign-out: awaiting it unbounded meant a stalled insert left the
    // user signed in with no feedback at all when they clicked Sign Out.
    await Promise.race([
      logAuditEvent(user?.id || null, 'logout', 'auth', user?.id || '', 'user', {}),
      new Promise((resolve) => setTimeout(resolve, AUDIT_TIMEOUT_MS)),
    ]);

    const { error } = await supabase.auth.signOut();

    if (error) {
      // The default scope revokes server-side, which needs the network. If that
      // fails, drop the local session anyway rather than stranding the user.
      console.error('[auth] sign out failed, clearing local session', error);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }

  async function resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message || null };
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) {
      await logAuditEvent(user?.id || null, 'password_changed', 'auth', user?.id || '', 'user', {});
    }
    return { error: error?.message || null };
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  function hasPermission(module: string, action: string) {
    if (role?.name === 'super_admin') return true;
    return permissions.some((p) => p.module === module && p.action === action);
  }

  function isSuperAdmin() {
    return role?.name === 'super_admin';
  }

  function clearForcedLogoutMessage() {
    setForcedLogoutMessage(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, role, permissions, session, loading, permissionsLoaded, forcedLogoutMessage, clearForcedLogoutMessage, signIn, signOut, resetPassword, updatePassword, refreshProfile, hasPermission, isSuperAdmin }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
