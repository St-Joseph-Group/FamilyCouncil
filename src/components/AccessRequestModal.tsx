import { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { logAuditEvent } from '../lib/audit';

const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  council_records: 'Council Records',
  meetings: 'Meetings',
  announcements: 'Announcements',
  members: 'Members',
  roles: 'Roles & Permissions',
  audit_logs: 'Audit Logs',
  chatbot: 'Chatbot',
  notifications: 'Notifications',
  chatbot_setup: 'Chatbot Setup',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Create',
  read: 'Read',
  update: 'Update',
  delete: 'Delete',
};

interface Props {
  open: boolean;
  module: string;
  action: string;
  onClose: () => void;
}

export default function AccessRequestModal({ open, module, action, onClose }: Props) {
  const { user } = useAuth();
  const [logged, setLogged] = useState(false);

  if (!open) return null;

  if (!logged && user) {
    setLogged(true);
    logAuditEvent(user.id, 'unauthorized_action_blocked', module, '', 'permission', {
      action, module,
    });
  }

  function handleClose() {
    setLogged(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-white font-semibold text-lg">Access Denied</h3>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-white text-sm font-medium">
            You don't have access to perform this action.
          </p>
          <p className="text-slate-400 text-xs mt-2">
            <span className="font-semibold text-slate-300">{ACTION_LABELS[action] || action}</span> permission for <span className="font-semibold text-slate-300">{MODULE_LABELS[module] || module}</span> is required. Please contact an administrator if you need access.
          </p>
        </div>

        <div className="flex justify-end p-6 border-t border-white/5">
          <button
            onClick={handleClose}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-sm font-medium transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
