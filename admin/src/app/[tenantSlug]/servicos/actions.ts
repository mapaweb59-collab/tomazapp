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

export async function createServico(slug: string, formData: FormData) {
  const tenantId = await getTenantId(slug);
  await api.post(`/api/tenants/${tenantId}/services`, {
    name: formData.get('name'),
    price: Number(formData.get('price')) || 0,
    duration_minutes: Number(formData.get('duration_minutes')) || 60,
    requires_handoff: formData.get('requires_handoff') === 'on',
  });
  revalidatePath(`/${slug}/servicos`);
}

export async function toggleServico(slug: string, id: string, active: boolean) {
  const tenantId = await getTenantId(slug);
  await api.patch(`/api/tenants/${tenantId}/services/${id}`, { active });
  revalidatePath(`/${slug}/servicos`);
}
