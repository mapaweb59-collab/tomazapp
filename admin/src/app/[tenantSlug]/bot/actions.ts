'use server';

import { revalidatePath } from 'next/cache';
import { api } from '../../../lib/api';
import { createAdminClient } from '../../../lib/supabase/admin-client';

async function getTenantId(slug: string): Promise<string> {
  const supabase = createAdminClient();
  const { data } = await supabase.from('tenants').select('id').eq('slug', slug).single();
  if (!data) throw new Error('Tenant not found');
  return data.id;
}

export async function saveBotConfig(slug: string, formData: FormData) {
  const tenantId = await getTenantId(slug);

  const config: Record<string, string> = {
    'bot.name': formData.get('bot_name') as string,
    'bot.studio_name': formData.get('studio_name') as string,
    'bot.tone': formData.get('tone') as string,
    'bot.welcome_message': formData.get('welcome_message') as string,
    'bot.handoff_message': formData.get('handoff_message') as string,
    'rag.content': formData.get('rag_content') as string,
  };

  await api.patch(`/api/tenants/${tenantId}/config`, config);
  await api.post(`/api/tenants/${tenantId}/rag/sync`);
  revalidatePath(`/${slug}/bot`);
}
