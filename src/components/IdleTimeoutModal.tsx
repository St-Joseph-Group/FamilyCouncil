import { useEffect, useRef, useState, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export default function IdleTimeoutModal() {
  const [show, setShow] = useState(false);
  const { signOut } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (show) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShow(true), IDLE_TIMEOUT_MS);
  }, [show]);

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  const handleOk = async () => {
    await signOut();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-amber-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-3">Session Expired</h3>
          <p className="text-slate-300 text-sm leading-relaxed">
            You have been inactive too long. Please login again.
          </p>
        </div>
        <div className="px-8 pb-8">
          <button
            onClick={handleOk}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold py-3 rounded-xl transition-all shadow-lg hover:shadow-amber-500/20"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
