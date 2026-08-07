import React, { useState } from 'react';
import {
  LayoutDashboard, FileText, Calendar, Megaphone, Users, MessageCircle,
  ClipboardList, Shield, Bell, ChevronLeft, ChevronRight, LogOut, User,
  Lock, Settings2, ChevronDown, ChevronUp, Webhook, Mail
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface NavLeaf {
  type: 'leaf';
  name: string;
  module: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
}

interface NavGroup {
  type: 'group';
  name: string;
  label: string;
  icon: React.ReactNode;
  children: NavLeaf[];
}

type NavEntry = NavLeaf | NavGroup;

const ICONS: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  records: <FileText className="w-5 h-5" />,
  meetings: <Calendar className="w-5 h-5" />,
  announcements: <Megaphone className="w-5 h-5" />,
  members: <Users className="w-5 h-5" />,
  chatbot: <MessageCircle className="w-5 h-5" />,
  audit: <ClipboardList className="w-5 h-5" />,
  roles: <Shield className="w-5 h-5" />,
  notifications: <Bell className="w-5 h-5" />,
  configuration: <Settings2 className="w-5 h-5" />,
  webhook: <Webhook className="w-5 h-5" />,
  smtp: <Mail className="w-5 h-5" />,
};

const ALL_NAV: NavEntry[] = [
  { type: 'leaf', name: 'dashboard', module: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: ICONS.dashboard },
  { type: 'leaf', name: 'council_records', module: 'council_records', label: 'Council Records', path: '/records', icon: ICONS.records },
  { type: 'leaf', name: 'meetings', module: 'meetings', label: 'Meetings', path: '/meetings', icon: ICONS.meetings },
  { type: 'leaf', name: 'chatbot', module: 'chatbot', label: 'Chatbot', path: '/chatbot', icon: ICONS.chatbot },
  { type: 'leaf', name: 'notifications', module: 'notifications', label: 'Notifications', path: '/notifications', icon: ICONS.notifications },
  {
    type: 'group',
    name: 'configuration',
    label: 'Configuration',
    icon: ICONS.configuration,
    children: [
      { type: 'leaf', name: 'config_announcements', module: 'announcements', label: 'Announcements', path: '/config/announcements', icon: ICONS.announcements },
      { type: 'leaf', name: 'config_members', module: 'members', label: 'Members', path: '/config/members', icon: ICONS.members },
      { type: 'leaf', name: 'config_audit', module: 'audit_logs', label: 'Audit Logs', path: '/config/audit', icon: ICONS.audit },
      { type: 'leaf', name: 'config_roles', module: 'roles', label: 'Roles & Permissions', path: '/config/roles', icon: ICONS.roles },
      { type: 'leaf', name: 'config_chatbot', module: 'chatbot_setup', label: 'Chatbot Setup', path: '/config/chatbot', icon: ICONS.webhook },
      { type: 'leaf', name: 'config_smtp', module: 'smtp_settings', label: 'SMTP Settings', path: '/config/smtp', icon: ICONS.smtp },
    ],
  },
];

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
  notificationCount: number;
  // Controlled by AppLayout so the rail width and the main content margin
  // cannot disagree. They were separate state before, which is why the layout
  // overflowed horizontally on small viewports.
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export default function Sidebar({ currentPath, onNavigate, notificationCount, collapsed, setCollapsed }: Props) {
  const { profile, role, signOut, isSuperAdmin, hasPermission } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set(['configuration']));

  function canNavigate(module: string): boolean {
    if (isSuperAdmin()) return true;
    return hasPermission(module, 'navigate');
  }

  function getVisibleNav(): NavEntry[] {
    return ALL_NAV.reduce<NavEntry[]>((acc, entry) => {
      if (entry.type === 'leaf') {
        if (canNavigate(entry.module)) acc.push(entry);
      } else {
        const visibleChildren = entry.children.filter((child) => canNavigate(child.module));
        if (visibleChildren.length > 0) {
          acc.push({ ...entry, children: visibleChildren });
        }
      }
      return acc;
    }, []);
  }

  const visibleNav = getVisibleNav();

  function toggleGroup(name: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function isGroupActive(group: NavGroup) {
    return group.children.some((c) => currentPath === c.path || currentPath.startsWith(c.path + '/'));
  }

  return (
    <aside
      className={`fixed top-0 left-0 h-screen bg-slate-900 border-r border-white/5 z-40 flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 h-16 flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-lg flex-shrink-0 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm truncate">Family Council</span>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center mx-auto">
            <Shield className="w-4 h-4 text-white" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center py-2 text-slate-400 hover:text-white transition-colors border-b border-white/5"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-thin">
        <ul className="space-y-0.5 px-2">
          {visibleNav.map((entry) => {
            if (entry.type === 'leaf') {
              const isActive = currentPath === entry.path || (entry.path !== '/dashboard' && currentPath.startsWith(entry.path));
              const badge = entry.name === 'notifications' ? notificationCount : 0;
              return (
                <li key={entry.name}>
                  <button
                    onClick={() => onNavigate(entry.path)}
                    title={collapsed ? entry.label : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                      isActive
                        ? 'bg-gradient-to-r from-blue-600/30 to-emerald-600/20 text-white border border-blue-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`}>
                      {entry.icon}
                    </span>
                    {!collapsed && <span className="truncate flex-1 text-left">{entry.label}</span>}
                    {!collapsed && badge > 0 && (
                      <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                    {collapsed && badge > 0 && (
                      <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </button>
                </li>
              );
            }

            // Group
            const group = entry as NavGroup;
            const isOpen = openGroups.has(group.name);
            const groupActive = isGroupActive(group);

            return (
              <li key={group.name}>
                {group.name === 'configuration' && (
                  <div className="border-t border-white/5 my-2 mx-1" />
                )}

                <button
                  onClick={() => { if (collapsed) setCollapsed(false); toggleGroup(group.name); }}
                  title={collapsed ? group.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                    groupActive
                      ? 'text-white bg-white/5'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <span className={`flex-shrink-0 ${groupActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-white'}`}>
                    {group.icon}
                  </span>
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{group.label}</span>
                      {isOpen ? <ChevronUp className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />}
                    </>
                  )}
                </button>

                {!collapsed && isOpen && (
                  <ul className="mt-0.5 ml-3 pl-3 border-l border-white/10 space-y-0.5">
                    {group.children.map((child) => {
                      const childActive = currentPath === child.path || currentPath.startsWith(child.path + '/');
                      return (
                        <li key={child.name}>
                          <button
                            onClick={() => onNavigate(child.path)}
                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm transition-all group ${
                              childActive
                                ? 'text-white bg-blue-600/20 border border-blue-500/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            <span className={`flex-shrink-0 ${childActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-white'}`}>
                              {React.cloneElement(child.icon as React.ReactElement, { className: 'w-4 h-4' })}
                            </span>
                            <span className="truncate text-left">{child.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User Section */}
      <div className="border-t border-white/5 p-3 flex-shrink-0">
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className={`w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-all ${collapsed ? 'justify-center' : ''}`}
          >
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
              {profile?.full_name?.[0] || profile?.username?.[0] || 'U'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <p className="text-white text-sm font-medium truncate">{profile?.full_name || profile?.username || 'User'}</p>
                <p className="text-slate-400 text-xs truncate">{role?.display_name || 'Member'}</p>
              </div>
            )}
          </button>

          {showUserMenu && (
            <div className={`absolute bottom-full ${collapsed ? 'left-full ml-2' : 'left-0 right-0'} mb-2 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50`}>
              <button onClick={() => { onNavigate('/profile'); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                <User className="w-4 h-4" />
                My Profile
              </button>
              <button onClick={() => { onNavigate('/change-password'); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm">
                <Lock className="w-4 h-4" />
                Change Password
              </button>
              <div className="border-t border-white/5" />
              <button onClick={() => { signOut(); setShowUserMenu(false); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm">
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
