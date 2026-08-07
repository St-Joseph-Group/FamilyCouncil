import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen, Search, Printer, ChevronRight, Check, Info, AlertTriangle,
  LayoutDashboard, FileText, Calendar, Megaphone, Users, MessageCircle,
  ClipboardList, Shield, Bell, Lock, Webhook, Mail, User, LifeBuoy, Compass,
  HelpCircle, X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { visibleSections, ManualSection } from '../lib/manual';

const ICONS: Record<string, React.ReactNode> = {
  start: <Compass className="w-5 h-5" />,
  lock: <Lock className="w-5 h-5" />,
  dashboard: <LayoutDashboard className="w-5 h-5" />,
  records: <FileText className="w-5 h-5" />,
  meetings: <Calendar className="w-5 h-5" />,
  chatbot: <MessageCircle className="w-5 h-5" />,
  notifications: <Bell className="w-5 h-5" />,
  announcements: <Megaphone className="w-5 h-5" />,
  members: <Users className="w-5 h-5" />,
  audit: <ClipboardList className="w-5 h-5" />,
  roles: <Shield className="w-5 h-5" />,
  webhook: <Webhook className="w-5 h-5" />,
  smtp: <Mail className="w-5 h-5" />,
  user: <User className="w-5 h-5" />,
  help: <LifeBuoy className="w-5 h-5" />,
};

function matches(section: ManualSection, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (section.title.toLowerCase().includes(needle)) return true;
  if (section.summary.toLowerCase().includes(needle)) return true;
  return section.tasks.some(
    (t) =>
      t.title.toLowerCase().includes(needle) ||
      t.when.toLowerCase().includes(needle) ||
      t.steps.some((s) => s.do.toLowerCase().includes(needle)),
  );
}

export default function UserManualPage() {
  const { hasPermission, isSuperAdmin, role } = useAuth();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);

  // Same permission model as the sidebar, so the manual can never describe a
  // page the reader cannot open, nor an action their buttons will refuse.
  const sections = useMemo(
    () => visibleSections(isSuperAdmin(), hasPermission),
    // hasPermission closes over `permissions`, so recompute when the role does
    [role?.id, isSuperAdmin, hasPermission],
  );

  const filtered = useMemo(() => sections.filter((s) => matches(s, query)), [sections, query]);

  const active =
    filtered.find((s) => s.id === activeId) || filtered[0] || null;

  // Move focus to the article when the reader *picks* a section, so a screen
  // reader starts on the new content instead of staying in the list.
  //
  // Gated on activeId rather than on a first-render ref: activeId is null until
  // the reader actually clicks something, which is exactly the condition we
  // want, and unlike a mount ref it is not defeated by StrictMode's double
  // invoke. Firing on mount scrolled the title and search box off the top
  // before the reader had seen either.
  useEffect(() => {
    if (!activeId || !articleRef.current) return;
    articleRef.current.focus({ preventScroll: true });
    articleRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [activeId]);

  const totalTasks = sections.reduce((n, s) => n + s.tasks.length, 0);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-5 h-5 text-blue-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white">User Manual</h1>
            <p className="text-slate-400 text-sm">
              Step by step, for everything you are allowed to do. No prior experience needed.
            </p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="print:hidden flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-sm font-medium transition-colors duration-200 flex-shrink-0"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Print this guide
        </button>
      </header>

      {/* ---------------------------------------------------------- search */}
      <div className="print:hidden relative">
        <Search
          className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          id="manual-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the manual, e.g. password, meeting, delete"
          aria-label="Search the manual"
          className="w-full min-h-[44px] bg-white/5 border border-white/10 rounded-xl pl-11 pr-11 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-10 text-center">
          <HelpCircle className="w-10 h-10 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-white font-semibold mb-1">Nothing matches “{query}”</h2>
          <p className="text-slate-400 text-sm mb-4">
            Try a simpler word, like “password”, “delete” or “meeting”.
          </p>
          <button
            onClick={() => setQuery('')}
            className="min-h-[44px] px-5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium transition-colors"
          >
            Show everything
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
          {/* ------------------------------------------------ section list */}
          {/* Native select on small screens: fewer taps, and it uses the
              device's own picker, which people already know how to use. */}
          <div className="lg:hidden print:hidden">
            <label htmlFor="manual-section" className="block text-sm font-medium text-slate-300 mb-1.5">
              Choose a topic
            </label>
            <select
              id="manual-section"
              value={active?.id || ''}
              onChange={(e) => setActiveId(e.target.value)}
              className="w-full min-h-[44px] bg-slate-800 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {filtered.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>

          <nav
            aria-label="Manual topics"
            className="hidden lg:block print:hidden sticky top-20 bg-slate-800/50 border border-white/5 rounded-2xl p-2"
          >
            <ul className="space-y-0.5">
              {filtered.map((s) => {
                const isActive = active?.id === s.id;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setActiveId(s.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-xl text-sm font-medium transition-colors duration-200 text-left ${
                        isActive
                          ? 'bg-gradient-to-r from-blue-600/30 to-emerald-600/20 text-white border border-blue-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                      }`}
                    >
                      <span className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                        {ICONS[s.icon]}
                      </span>
                      {/* Wraps rather than truncating: a topic nobody can read
                          the end of is a topic they will not click. */}
                      <span className="flex-1 leading-snug">{s.title}</span>
                      {isActive && <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="text-slate-500 text-xs px-3 py-3 border-t border-white/5 mt-2 leading-relaxed">
              {filtered.length} topic{filtered.length === 1 ? '' : 's'}, {totalTasks} task
              {totalTasks === 1 ? '' : 's'}. This manual only shows what your role allows.
            </p>
          </nav>

          {/* ---------------------------------------------------- article */}
          {active && (
            <article
              ref={articleRef}
              tabIndex={-1}
              aria-labelledby="manual-section-title"
              className="focus:outline-none space-y-5 min-w-0"
            >
              <div className="bg-slate-800/50 border border-white/5 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-blue-400 flex-shrink-0">{ICONS[active.icon]}</span>
                  <h2 id="manual-section-title" className="text-lg font-bold text-white">
                    {active.title}
                  </h2>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed max-w-[70ch]">{active.summary}</p>
              </div>

              {active.tasks.map((task, taskIndex) => (
                <section
                  key={task.id}
                  aria-labelledby={`task-${task.id}`}
                  className="bg-slate-800/50 border border-white/5 rounded-2xl overflow-hidden"
                >
                  <div className="px-6 pt-5 pb-4 border-b border-white/5">
                    <h3 id={`task-${task.id}`} className="text-white font-semibold text-base">
                      <span className="text-slate-500 font-mono text-sm mr-2 tabular-nums">
                        {taskIndex + 1}.
                      </span>
                      {task.title}
                    </h3>
                    <p className="text-slate-400 text-sm mt-1 ml-7 leading-relaxed max-w-[70ch]">
                      {task.when}
                    </p>
                  </div>

                  <ol className="p-6 space-y-4">
                    {task.steps.map((step, i) => (
                      <li key={i} className="flex gap-4">
                        <span
                          className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center justify-center tabular-nums"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 space-y-2 pt-0.5">
                          <p className="text-slate-200 text-sm leading-relaxed max-w-[70ch]">{step.do}</p>

                          {step.see && (
                            <p className="flex items-start gap-2 text-emerald-300/90 text-sm leading-relaxed max-w-[70ch]">
                              <Check className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                              <span>
                                <span className="text-emerald-400/70 font-medium">You should see: </span>
                                {step.see}
                              </span>
                            </p>
                          )}

                          {step.note && (
                            <p className="flex items-start gap-2 text-slate-400 text-sm leading-relaxed max-w-[70ch]">
                              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-500" aria-hidden="true" />
                              <span>{step.note}</span>
                            </p>
                          )}

                          {step.warn && (
                            <p className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-amber-200 text-sm leading-relaxed max-w-[70ch]">
                              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
                              <span>
                                <span className="font-medium">Careful: </span>
                                {step.warn}
                              </span>
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}

              {active.faqs && active.faqs.length > 0 && (
                <section
                  aria-labelledby="manual-faq"
                  className="bg-slate-800/50 border border-white/5 rounded-2xl p-6"
                >
                  <h3 id="manual-faq" className="text-white font-semibold text-base mb-4">
                    Common questions
                  </h3>
                  <dl className="space-y-4">
                    {active.faqs.map((faq, i) => (
                      <div key={i} className="border-l-2 border-blue-500/30 pl-4">
                        <dt className="text-slate-200 text-sm font-medium mb-1 max-w-[70ch]">{faq.q}</dt>
                        <dd className="text-slate-400 text-sm leading-relaxed max-w-[70ch]">{faq.a}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </article>
          )}
        </div>
      )}
    </div>
  );
}
