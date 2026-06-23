import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function UpdateNotificationModal() {
  const [show, setShow] = useState(false);
  const [initialVersion, setInitialVersion] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('system_version')
      .select('version')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setInitialVersion(data.version);
      });
  }, []);

  useEffect(() => {
    if (!initialVersion) return;

    const channel = supabase
      .channel('system-version-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_version' },
        () => setShow(true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'system_version' },
        (payload) => {
          const newVersion = (payload.new as { version?: string })?.version;
          if (newVersion && newVersion !== initialVersion) {
            setShow(true);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [initialVersion]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <RefreshCw className="w-8 h-8 text-blue-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-3">System Update Available</h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            There is an update in the system. Click OK to refresh the page to see the new update.
          </p>
        </div>
        <div className="px-8 pb-8">
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-blue-500/20"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
