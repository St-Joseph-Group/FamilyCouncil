import React, { useEffect, useState } from 'react';
import {
  FileText, Calendar, Megaphone, Users, TrendingUp, Clock, CheckCircle, AlertCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Stats {
  records: number;
  meetings: number;
  announcements: number;
  members: number;
}

interface RecentActivity {
  id: string;
  action: string;
  module: string;
  created_at: string;
  user?: { full_name: string; email: string };
}

export default function DashboardPage() {
  const { profile, role } = useAuth();
  const [stats, setStats] = useState<Stats>({ records: 0, meetings: 0, announcements: 0, members: 0 });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<{ id: string; title: string; meeting_date: string; location: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    const [recordsRes, meetingsRes, announcementsRes, membersRes, activityRes, upcomingRes] = await Promise.all([
      supabase.from('council_records').select('*', { count: 'exact', head: true }),
      supabase.from('meetings').select('*', { count: 'exact', head: true }),
      supabase.from('announcements').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('audit_logs').select('id, action, module, created_at, user:profiles(full_name, email)').order('created_at', { ascending: false }).limit(8),
      supabase.from('meetings').select('id, title, meeting_date, location').gte('meeting_date', new Date().toISOString()).order('meeting_date').limit(5),
    ]);

    setStats({
      records: recordsRes.count || 0,
      meetings: meetingsRes.count || 0,
      announcements: announcementsRes.count || 0,
      members: membersRes.count || 0,
    });
    setRecentActivity((activityRes.data as RecentActivity[]) || []);
    setUpcomingMeetings(upcomingRes.data || []);
    setLoading(false);
  }

  const statCards = [
    { label: 'Council Records', value: stats.records, icon: <FileText className="w-6 h-6" />, color: 'from-blue-500 to-blue-600', bg: 'bg-blue-500/10' },
    { label: 'Meetings', value: stats.meetings, icon: <Calendar className="w-6 h-6" />, color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-500/10' },
    { label: 'Announcements', value: stats.announcements, icon: <Megaphone className="w-6 h-6" />, color: 'from-amber-500 to-amber-600', bg: 'bg-amber-500/10' },
    { label: 'Members', value: stats.members, icon: <Users className="w-6 h-6" />, color: 'from-rose-500 to-rose-600', bg: 'bg-rose-500/10' },
  ];

  const getActionIcon = (action: string) => {
    if (action.includes('login')) return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    if (action.includes('failed') || action.includes('delete')) return <AlertCircle className="w-4 h-4 text-red-400" />;
    return <TrendingUp className="w-4 h-4 text-blue-400" />;
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-600/20 to-emerald-600/20 border border-white/5 rounded-2xl p-6">
        <h2 className="text-2xl font-bold text-white">
          Welcome back, {profile?.full_name || profile?.username || 'User'}
        </h2>
        <p className="text-slate-400 mt-1">
          {role?.display_name} — {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="bg-slate-800/50 border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center`}>
                <span className={`bg-gradient-to-br ${card.color} bg-clip-text text-transparent`}>
                  {card.icon}
                </span>
              </div>
              <TrendingUp className="w-4 h-4 text-emerald-400 opacity-60" />
            </div>
            <p className="text-3xl font-bold text-white">{loading ? '—' : card.value}</p>
            <p className="text-slate-400 text-sm mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            Recent Activity
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No recent activity</p>
          ) : (
            <ul className="space-y-3">
              {recentActivity.map((item) => (
                <li key={item.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="mt-0.5">{getActionIcon(item.action)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white capitalize">{item.action.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {(item.user as { full_name: string; email: string } | undefined)?.full_name || 'System'} — {item.module}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">{formatTime(item.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Upcoming Meetings */}
        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            Upcoming Meetings
          </h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : upcomingMeetings.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No upcoming meetings</p>
          ) : (
            <ul className="space-y-3">
              {upcomingMeetings.map((meeting) => (
                <li key={meeting.id} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex-shrink-0 flex flex-col items-center justify-center">
                    <span className="text-emerald-400 text-xs font-bold">
                      {new Date(meeting.meeting_date).getDate()}
                    </span>
                    <span className="text-emerald-400 text-xs">
                      {new Date(meeting.meeting_date).toLocaleString('en', { month: 'short' })}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{meeting.title}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(meeting.meeting_date).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })}
                      {meeting.location ? ` — ${meeting.location}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
