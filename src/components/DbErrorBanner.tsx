import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { onDbError, DbErrorEvent } from '../lib/supabase';

/**
 * Surfaces failed database calls to the user.
 *
 * Most call sites destructure only `data` and drop `error`, so a failed query
 * renders as an empty list and looks like "no data" rather than "this broke".
 * That is how the Council Records embed ambiguity hid three existing records.
 * Rather than rewrite every call site, this listens to the client-level
 * interceptor and shows whatever failed, on whichever page it happened.
 */
export default function DbErrorBanner() {
  const [error, setError] = useState<DbErrorEvent | null>(null);

  useEffect(() => onDbError(setError), []);

  if (!error) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[calc(100%-2rem)]">
      <div className="flex items-start gap-3 bg-red-950/95 backdrop-blur border border-red-500/40 rounded-xl px-4 py-3 shadow-2xl">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium">
            Could not load {error.table.replace(/^rpc:/, '')}
          </p>
          <p className="text-red-300/90 text-xs mt-0.5 break-words">
            {error.code ? `${error.code}: ` : ''}{error.message}
          </p>
          <p className="text-slate-400 text-xs mt-1">
            Data on this page may be incomplete. Contact an administrator if this persists.
          </p>
        </div>
        <button
          onClick={() => setError(null)}
          className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
