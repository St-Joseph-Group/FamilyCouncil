import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  children: React.ReactNode;
  currentPath: string;
  pageTitle: string;
  onNavigate: (path: string) => void;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/records': 'Council Records',
  '/meetings': 'Meetings',
  '/chatbot': 'Chatbot',
  '/notifications': 'Notifications',
  '/profile': 'My Profile',
  '/change-password': 'Change Password',
  '/config': 'Configuration',
  '/config/announcements': 'Announcements',
  '/config/members': 'Members',
  '/config/audit': 'Audit Logs',
  '/config/roles': 'Roles & Permissions',
  '/config/chatbot': 'Chatbot Setup',
};

export default function AppLayout({ children, currentPath, onNavigate }: Props) {
  const { user } = useAuth();
  const [notificationCount, setNotificationCount] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarWidth = sidebarCollapsed ? 64 : 256;
  const title = PAGE_TITLES[currentPath] || 'Family Council';

  useEffect(() => {
    if (!user) return;
    fetchNotificationCount();
    const interval = setInterval(fetchNotificationCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  async function fetchNotificationCount() {
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    setNotificationCount(count || 0);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar
        currentPath={currentPath}
        onNavigate={onNavigate}
        notificationCount={notificationCount}
      />
      <TopBar
        title={title}
        notificationCount={notificationCount}
        onNotificationsClick={() => onNavigate('/notifications')}
        sidebarWidth={sidebarWidth}
      />
      <main
        className="transition-all duration-300 pt-16 min-h-screen"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
