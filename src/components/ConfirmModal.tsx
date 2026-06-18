import React from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  variant = 'danger', loading = false, onConfirm, onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  const colors = {
    danger: { icon: 'text-red-400', bg: 'bg-red-500/20', btn: 'bg-red-500 hover:bg-red-600' },
    warning: { icon: 'text-amber-400', bg: 'bg-amber-500/20', btn: 'bg-amber-500 hover:bg-amber-600' },
    info: { icon: 'text-blue-400', bg: 'bg-blue-500/20', btn: 'bg-blue-500 hover:bg-blue-600' },
  }[variant];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <div className={`w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center`}>
            <AlertTriangle className={`w-6 h-6 ${colors.icon}`} />
          </div>
          <div>
            <h3 className="text-white font-semibold text-lg">{title}</h3>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 ${colors.btn} text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-all disabled:opacity-50`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
