import { supabase } from '../../lib/supabase';
import { sendTelegramAlert } from '../../integrations/telegram';

type Severity = 'low' | 'medium' | 'high' | 'critical';

export async function logIncident(
  severity: Severity,
  type: string,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('incidents').insert({
    severity,
    type,
    description,
    metadata: metadata ?? {},
  });

  if (error) console.error('[incidents] failed to log:', error.message);

  if (severity === 'critical' || severity === 'high') {
    await sendTelegramAlert(`[${severity.toUpperCase()}] ${type}: ${description}`).catch(() => {});
  }
}
