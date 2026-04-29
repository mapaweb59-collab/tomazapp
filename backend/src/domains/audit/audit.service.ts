import { supabase } from '../../lib/supabase';

interface AuditEntry {
  entity_type: 'appointment' | 'payment' | 'customer' | 'conversation';
  entity_id: string;
  action: 'created' | 'updated' | 'cancelled' | 'rescheduled' | 'handoff';
  actor: 'bot' | 'human' | 'system';
  before_state?: unknown;
  after_state?: unknown;
  channel?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabase.from('audit_log').insert(entry);
  if (error) console.error('[audit] failed to log:', error.message);
}
