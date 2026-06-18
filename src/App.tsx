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
import { supabase } from './lib/supabase';
import { Shield, Loader2 } from 'lucide-react';

type AuthScreen = 'login' | 'forgot-password';

function AppInner() {
  const { user, loading, session } = useAuth();
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [currentPath, setCurrentPath] = useState('/dashboard');

  useEffect(() => {
    if (session) {
      const hash = window.location.hash;
      if (hash.includes('type=recovery')) {
        setCurrentPath('/change-password');
      }
    }
  }, [session]);

  // Reset to dashboard on sign-out so next login always lands on dashboard
  useEffect(() => {
    if (!user && !loading) {
      setCurrentPath('/dashboard');
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

  function renderPage() {
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
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
