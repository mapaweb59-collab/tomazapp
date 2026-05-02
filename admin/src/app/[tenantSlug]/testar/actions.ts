'use server';

import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';

interface ConversationState {
  fase: string;
  profissional: string | null;
  modalidade: string | null;
  dia: string | null;
  horario: string | null;
  slotId: string | null;
  nomeCliente: string | null;
  idempotencyKey: string;
}

interface BotResponse {
  intent: string;
  fase: string;
  message: string;
  extraido: Record<string, string | null>;
}

export interface SimulatorResult {
  reply: BotResponse;
  newState: ConversationState;
  toolCalls: { name: string; args: unknown; result: string }[];
  effects: { handoff: boolean; appointmentCreated: boolean; paymentRequested: boolean };
  conversationId: string;
  sessionId: string;
  warning?: string;
}

async function getTenantId(slug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  if (!data) throw new Error('Tenant não encontrado');
  return data.id;
}

export async function sendSimulatorMessage(
  slug: string,
  payload: {
    message: string;
    sessionId?: string;
    state?: ConversationState;
    history?: { role: 'user' | 'assistant'; content: string }[];
  },
): Promise<SimulatorResult> {
  const tenantId = await getTenantId(slug);
  return api.post<SimulatorResult>(`/api/tenants/${tenantId}/simulator/chat`, payload);
}
