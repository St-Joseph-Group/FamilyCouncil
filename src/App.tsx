import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ChangePasswordPage from './pages/auth/ChangePasswordPage';
import AppLayout from './components/layout/AppLayout';
import DashboardPage from './pages/DashboardPage';
import CouncilRecordsPage from './pages/CouncilRecordsPage';
import MeetingsPage from './pages/MeetingsPage';
import AnnouncementsPage from './pages/AnnouncementsPage';
import MembersPage from './pages/MembersPage';
import ChatbotPage from './pages/ChatbotPage';
import AuditLogsPage from './pages/AuditLogsPage';
import RolesPermissionsPage from './pages/RolesPermissionsPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';

// The manual is a large block of static prose that most sessions never open, so
// it is split out rather than carried in the initial bundle.
const UserManualPage = React.lazy(() => import('./pages/UserManualPage'));
import ChatbotSetupPage from './pages/config/ChatbotSetupPage';
import SmtpSettingsPage from './pages/config/SmtpSettingsPage';
import FloatingChatbox from './components/chatbot/FloatingChatbox';
import ErrorBoundary from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import { Shield, Loader2, ShieldAlert, RefreshCw, BookOpen } from 'lucide-react';

type AuthScreen = 'login' | 'forgot-password';

// Shown when a user has no navigable page at all, or lands on one they cannot access.
const NO_ACCESS = '/no-access';

// Reachable regardless of role — every signed-in user owns these, and help is
// never gated: someone with no module access still needs to read why, and how
// to ask for it. The manual filters its own contents by the same permissions.
const ALWAYS_ALLOWED = ['/profile', '/change-password', '/manual'];

const NAV_ORDER: { module: string; path: string }[] = [
  { module: 'dashboard', path: '/dashboard' },
  { module: 'council_records', path: '/records' },
  { module: 'meetings', path: '/meetings' },
  { module: 'chatbot', path: '/chatbot' },
  { module: 'notifications', path: '/notifications' },
  { module: 'announcements', path: '/config/announcements' },
  { module: 'members', path: '/config/members' },
  { module: 'audit_logs', path: '/config/audit' },
  { module: 'roles', path: '/config/roles' },
  { module: 'chatbot_setup', path: '/config/chatbot' },
  { module: 'smtp_settings', path: '/config/smtp' },
];

const PATH_TO_MODULE: Record<string, string> = NAV_ORDER.reduce(
  (acc, n) => ({ ...acc, [n.path]: n.module }),
  { '/config': 'announcements' } as Record<string, string>
);

function AppInner() {
  const { user, loading, session, role, permissionsLoaded, profileError, refreshProfile, signOut, hasPermission, isSuperAdmin } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [currentPath, setCurrentPath] = useState('');
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    if (session) {
      const hash = window.location.hash;
      if (hash.includes('type=recovery')) {
        setCurrentPath('/change-password');
        setHasRedirected(true);
      }
    }
  }, [session]);

  // After login, redirect to the first page the user is allowed to see.
  // Waits on permissionsLoaded: `role` is set before the role_permissions query
  // resolves, and redirecting on an empty permission set lands everyone on the
  // dashboard regardless of whether they can access it.
  useEffect(() => {
    if (user && role && permissionsLoaded && !hasRedirected) {
      if (isSuperAdmin()) {
        setCurrentPath('/dashboard');
      } else {
        const firstAllowed = NAV_ORDER.find((n) => hasPermission(n.module, 'navigate'));
        // With no module at all, land on the manual rather than a dead end. It
        // explains why the menu is empty and how to ask for access.
        setCurrentPath(firstAllowed?.path || '/manual');
      }
      setHasRedirected(true);
    }
  }, [user, role, permissionsLoaded, hasRedirected]);

  // Reset on sign-out so next login recalculates
  useEffect(() => {
    if (!user && !loading) {
      setCurrentPath('');
      setHasRedirected(false);
    }
  }, [user, loading]);

  // Ensure profile exists for authenticated users
  useEffect(() => {
    if (user) {
      ensureProfile(user);
    }
  }, [user]);

  async function ensureProfile(authUser: { id: string; email?: string }) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', authUser.id)
      .maybeSingle();

    // A failed lookup also yields data === null. Treating that as "no profile"
    // provisioned a duplicate (23505 on profiles_pkey), and had the insert gone
    // through it would have reset an existing member to guest_viewer.
    if (error || data) return;

    const defaultRole = await supabase.from('roles').select('id').eq('name', 'guest_viewer').maybeSingle();

    // upsert + ignoreDuplicates so two concurrent runs (token refresh re-fires
    // this effect) cannot collide. Never overwrites an existing profile.
    await supabase.from('profiles').upsert(
      {
        id: authUser.id,
        email: authUser.email || '',
        full_name: authUser.email?.split('@')[0] || '',
        role_id: defaultRole.data?.id || null,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    if (authScreen === 'forgot-password') {
      return <ForgotPasswordPage onBack={() => setAuthScreen('login')} />;
    }
    return <LoginPage onForgotPassword={() => setAuthScreen('forgot-password')} />;
  }

  function canAccess(path: string) {
    if (ALWAYS_ALLOWED.includes(path)) return true;
    if (isSuperAdmin()) return true;
    const module = PATH_TO_MODULE[path];
    return module ? hasPermission(module, 'navigate') : false;
  }

  function renderPage() {
    // Belt and braces: the sidebar already hides these, but direct navigation
    // (or a stale currentPath after a role change) must not render the page.
    if (!canAccess(currentPath)) {
      return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">No access</h3>
          <p className="text-slate-400 text-sm max-w-sm mb-6">
            You do not have permission to view this page. Contact an administrator if you
            believe this is a mistake.
          </p>
          {/* Never leave someone at a dead end with no next step. */}
          <button
            onClick={() => setCurrentPath('/manual')}
            className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors"
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Read the user manual
          </button>
        </div>
      );
    }

    switch (currentPath) {
      case '/dashboard': return <DashboardPage />;
      case '/records': return <CouncilRecordsPage />;
      case '/meetings': return <MeetingsPage />;
      case '/chatbot': return <ChatbotPage />;
      case '/notifications': return <NotificationsPage />;
      case '/manual':
        return (
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                <span>Loading the manual…</span>
              </div>
            }
          >
            <UserManualPage />
          </React.Suspense>
        );
      case '/profile': return <ProfilePage />;
      case '/change-password':
        return (
          <div className="max-w-lg">
            <ChangePasswordPage />
          </div>
        );
      // Configuration sub-routes
      case '/config':
      case '/config/announcements': return <AnnouncementsPage />;
      case '/config/members': return <MembersPage />;
      case '/config/audit': return <AuditLogsPage />;
      case '/config/roles': return <RolesPermissionsPage />;
      case '/config/chatbot': return <ChatbotSetupPage />;
      case '/config/smtp': return <SmtpSettingsPage />;
      default: return <DashboardPage />;
    }
  }

  // A load that failed will never produce permissions, so the spinner below
  // would never end. Only applies before the first successful load: a failed
  // background refresh must not throw away a session that is already working.
  if (!hasRedirected && profileError) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-white font-semibold text-lg mb-2">Could not load your account</h1>
          <p className="text-slate-400 text-sm mb-1">
            You are signed in, but your profile and permissions could not be read, so there
            is nothing safe to show yet.
          </p>
          <p className="text-slate-500 text-xs mb-6 break-words">{profileError}</p>

          <div className="flex gap-2">
            <button
              onClick={() => refreshProfile()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-blue-500 to-emerald-500 text-white rounded-xl text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Try again
            </button>
            <button
              onClick={() => signOut()}
              className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-medium transition-all"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // currentPath is only decided once permissions are known; rendering before that
  // would briefly show the dashboard to users who cannot access it.
  if (!hasRedirected) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-2xl flex items-center justify-center animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AppLayout currentPath={currentPath} pageTitle="" onNavigate={setCurrentPath}>
        {renderPage()}
      </AppLayout>
      {currentPath !== '/chatbot' && <FloatingChatbox />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  );
}
