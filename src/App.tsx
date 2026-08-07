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
import ChatbotSetupPage from './pages/config/ChatbotSetupPage';
import SmtpSettingsPage from './pages/config/SmtpSettingsPage';
import FloatingChatbox from './components/chatbot/FloatingChatbox';
import ErrorBoundary from './components/ErrorBoundary';
import { supabase } from './lib/supabase';
import { Shield, Loader2, ShieldAlert } from 'lucide-react';

type AuthScreen = 'login' | 'forgot-password';

// Shown when a user has no navigable page at all, or lands on one they cannot access.
const NO_ACCESS = '/no-access';

// Reachable regardless of role — every signed-in user owns these.
const ALWAYS_ALLOWED = ['/profile', '/change-password'];

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
  const { user, loading, session, role, permissionsLoaded, hasPermission, isSuperAdmin } = useAuth();
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
        setCurrentPath(firstAllowed?.path || NO_ACCESS);
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
    const { data } = await supabase.from('profiles').select('id').eq('id', authUser.id).maybeSingle();
    if (!data) {
      const defaultRole = await supabase.from('roles').select('id').eq('name', 'guest_viewer').maybeSingle();
      await supabase.from('profiles').insert({
        id: authUser.id,
        email: authUser.email || '',
        full_name: authUser.email?.split('@')[0] || '',
        role_id: defaultRole.data?.id || null,
      });
    }
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
          <p className="text-slate-400 text-sm max-w-sm">
            You do not have permission to view this page. Contact an administrator if you
            believe this is a mistake.
          </p>
        </div>
      );
    }

    switch (currentPath) {
      case '/dashboard': return <DashboardPage />;
      case '/records': return <CouncilRecordsPage />;
      case '/meetings': return <MeetingsPage />;
      case '/chatbot': return <ChatbotPage />;
      case '/notifications': return <NotificationsPage />;
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
