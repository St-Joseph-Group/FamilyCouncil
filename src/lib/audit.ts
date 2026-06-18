import { supabase } from './supabase';

export async function logAuditEvent(
  userId: string | null,
  action: string,
  module: string,
  targetId = '',
  targetType = '',
  details: Record<string, unknown> = {}
) {
  try {
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      module,
      target_id: targetId,
      target_type: targetType,
      details,
      ip_address: '',
      user_agent: navigator.userAgent,
    });
  } catch {
    // Non-blocking: audit failures should not interrupt user flow
  }
}
