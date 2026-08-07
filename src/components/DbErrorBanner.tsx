import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, WifiOff, X } from 'lucide-react';
import { onDbError, DbErrorEvent } from '../lib/supabase';

/** How long a transient connection blip stays on screen before clearing itself. */
const NETWORK_AUTO_DISMISS_MS = 6000;

/**
 * A failed request is either the network dropping or the database refusing.
 * Only the second one is worth alarming about: "Failed to fetch" means the
 * request never arrived, usually resolves by itself, and the raw TypeError
 * means nothing to a council member. A PostgREST code means real breakage.
 */
function isNetworkError(e: DbErrorEvent): boolean {
  if (e.code) return false; // PostgREST answered, so the network was fine
  return /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(e.message);
}

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
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return onDbError((e) => {
      setError(e);
      window.clearTimeout(timerRef.current);
      // Connection blips clear themselves; real database errors stay until the
      // user dismisses them, so they can be read and reported.
      if (isNetworkError(e)) {
        timerRef.current = window.setTimeout(() => setError(null), NETWORK_AUTO_DISMISS_MS);
      }
    });
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  if (!error) return null;

  const network = isNetworkError(error);
  const label = error.table.replace(/^rpc:/, '');

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[calc(100%-2rem)]">
      <div
        className={`flex items-start gap-3 backdrop-blur rounded-xl px-4 py-3 shadow-2xl border ${
          network
            ? 'bg-amber-950/95 border-amber-500/40'
            : 'bg-red-950/95 border-red-500/40'
        }`}
      >
        {network ? (
          <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        )}

        <div className="min-w-0 flex-1">
          {network ? (
            <>
              <p className="text-white text-sm font-medium">Connection problem</p>
              <p className="text-amber-200/90 text-xs mt-0.5">
                Could not reach the server while loading {label}. Check your connection —
                this usually clears on its own.
              </p>
            </>
          ) : (
            <>
              <p className="text-white text-sm font-medium">Could not load {label}</p>
              <p className="text-red-300/90 text-xs mt-0.5 break-words">
                {error.code ? `${error.code}: ` : ''}{error.message}
              </p>
              <p className="text-slate-400 text-xs mt-1">
                Data on this page may be incomplete. Contact an administrator if this persists.
              </p>
            </>
          )}
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
