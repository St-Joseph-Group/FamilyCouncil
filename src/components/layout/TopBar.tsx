import React from 'react';
import { Bell, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  title: string;
  notificationCount: number;
  onNotificationsClick: () => void;
  sidebarWidth: number;
}

export default function TopBar({ title, notificationCount, onNotificationsClick, sidebarWidth }: Props) {
  const { profile, role } = useAuth();

  return (
    <header
      className="fixed top-0 right-0 h-16 bg-slate-900/80 backdrop-blur-sm border-b border-white/5 z-30 flex items-center justify-between px-6 transition-all duration-300"
      style={{ left: sidebarWidth }}
    >
      <div>
        <h1 className="text-white font-semibold text-lg">{title}</h1>
        <p className="text-slate-400 text-xs">{role?.display_name}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search..."
            className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-48"
          />
        </div>

        <button
          onClick={onNotificationsClick}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all"
        >
          <Bell className="w-4 h-4" />
          {notificationCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </button>

        <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
          {profile?.full_name?.[0] || profile?.username?.[0] || 'U'}
        </div>
      </div>
    </header>
  );
}
